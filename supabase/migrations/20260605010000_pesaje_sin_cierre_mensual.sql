-- ============================================================================
-- 59 · Pesaje funciona sin cierre mensual abierto
--
-- Máquinas con requiere_pesaje=true (típicamente las que no tienen Nayax)
-- necesitan pesar en CADA visita, no solo durante cierre mensual. Antes
-- el RPC fallaba si no había cierre. Ahora:
--
--   - pesajes_maquina.cierre_id puede ser NULL
--   - El RPC busca cierre abierto; si no hay, guarda con cierre_id=null
--   - Pesajes huérfanos se pueden asociar manualmente después si abre
--     un cierre que los abarque
-- ============================================================================

alter table public.pesajes_maquina
  alter column cierre_id drop not null;

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

  -- Busca cierre abierto si existe; sino, deja null. Ya NO falla.
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
  end loop;

  return v_pesaje_id;
end;
$$;

revoke all on function public.op_registrar_pesaje_maquina(uuid, jsonb, text) from public;
grant execute on function public.op_registrar_pesaje_maquina(uuid, jsonb, text) to authenticated;
