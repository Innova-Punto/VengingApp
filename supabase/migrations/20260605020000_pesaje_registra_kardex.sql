-- ============================================================================
-- 60 · Pesaje registra movimiento en kardex (ajuste_conteo_maquina)
--
-- El RPC op_registrar_pesaje_maquina no estaba insertando en
-- movimientos_inventario en sus últimas versiones. Resultado: las mermas
-- y sobrantes detectados durante el pesaje no aparecían en el cierre
-- mensual ni en el COGS.
--
-- Especialmente crítico para máquinas con requiere_pesaje=true (sin
-- Nayax): el pesaje es la ÚNICA forma de capturar el consumo, así que
-- sus mermas son contablemente "ventas fantasma" que deben sumar al
-- costo del mes.
--
-- Esta migración restaura el insert al kardex.
-- ============================================================================

create or replace function public.op_registrar_pesaje_maquina(
  p_check_in_id uuid,
  p_items jsonb,
  p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_operador uuid;
  v_maquina_id uuid;
  v_cierre_id uuid;
  v_pesaje_id uuid;
  v_item jsonb;
  v_tolva_id uuid;
  v_gramos_medidos int;
  v_tolva record;
  v_diff int;
  v_diff_pct numeric(8,4);
  v_valor numeric(14,2);
  v_alerta boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select operador_id, maquina_id into v_operador, v_maquina_id
    from public.check_ins where id = p_check_in_id;
  if v_maquina_id is null then
    raise exception 'Check-in no encontrado';
  end if;
  if v_operador <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para este check-in';
  end if;

  select id into v_cierre_id from public.cierres_mensuales
    where estado in ('abierto', 'en_proceso')
    order by anio desc, mes desc
    limit 1;

  insert into public.pesajes_maquina (cierre_id, maquina_id, check_in_id, operador_id, notas)
  values (v_cierre_id, v_maquina_id, p_check_in_id, v_operador, p_notas)
  returning id into v_pesaje_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_tolva_id := (v_item->>'tolva_id')::uuid;
    v_gramos_medidos := coalesce((v_item->>'gramos_medidos')::int, 0);

    if v_gramos_medidos < 0 then
      raise exception 'gramos_medidos debe ser >= 0';
    end if;

    select * into v_tolva from public.tolvas where id = v_tolva_id;
    if v_tolva is null then
      raise exception 'Tolva % no existe', v_tolva_id;
    end if;

    v_diff := v_gramos_medidos - v_tolva.inventario_actual_g;
    v_diff_pct := case
      when v_tolva.inventario_actual_g > 0 then
        round(abs(v_diff)::numeric / v_tolva.inventario_actual_g * 100, 4)
      else null
    end;
    v_valor := round(v_diff * coalesce(v_tolva.costo_promedio_g_actual, 0), 2);
    v_alerta := coalesce(v_diff_pct >= 5, false);

    insert into public.pesaje_tolva_items (
      pesaje_id, tolva_id, gramos_teorico, gramos_medidos,
      diferencia_porcentaje, valor_diferencia,
      costo_promedio_g_snapshot, alerta_generada
    ) values (
      v_pesaje_id, v_tolva_id, v_tolva.inventario_actual_g, v_gramos_medidos,
      v_diff_pct, v_valor,
      coalesce(v_tolva.costo_promedio_g_actual, 0), v_alerta
    );

    update public.tolvas set
      inventario_actual_g = v_gramos_medidos,
      ultimo_pesaje_at = now()
    where id = v_tolva_id;

    -- Kardex: ajuste_conteo_maquina (negativo = merma; positivo = sobrante).
    -- La vista vista_reporte_cierre suma esto en valor_ajuste_pesaje del
    -- reporte mensual, así representan el COGS de "ventas fantasma" para
    -- máquinas sin Nayax.
    if v_diff <> 0 and v_tolva.producto_id is not null then
      insert into public.movimientos_inventario (
        tipo, producto_id, maquina_id, tolva_id,
        presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id
      ) values (
        'ajuste_conteo_maquina'::movimiento_tipo,
        v_tolva.producto_id, v_maquina_id, v_tolva_id,
        'polvo_en_tolva'::mov_presentacion,
        0, 0, v_diff,
        coalesce(v_tolva.costo_promedio_g_actual, 0),
        v_valor,
        'pesaje_tolva_items', v_pesaje_id, v_uid
      );
    end if;
  end loop;

  return v_pesaje_id;
end;
$$;

revoke all on function public.op_registrar_pesaje_maquina(uuid, jsonb, text) from public;
grant execute on function public.op_registrar_pesaje_maquina(uuid, jsonb, text) to authenticated;
