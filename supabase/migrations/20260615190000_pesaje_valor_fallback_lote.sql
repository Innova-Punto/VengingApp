-- ============================================================================
-- Pesaje inicial: fallback al costo del último lote del producto cuando la
-- tolva aún no tiene costo (caso "primer pesaje" / inventario inicial). Sin
-- este fallback, `valor_diferencia` quedaba en $0 aunque hubiera 500g+
-- registrados, porque `tolvas.costo_promedio_g_actual` solo se popula tras
-- el primer llenado PEPS.
--
-- Además: cuando ocurre un pesaje inicial (inventario previo = 0) y
-- resolvemos un costo desde lotes, lo sembramos en la tolva — así las
-- operaciones siguientes ya tienen un costo base sin tener que esperar al
-- primer llenado.
-- ============================================================================

create or replace function public.op_registrar_pesaje_maquina(
  p_check_in_id uuid, p_items jsonb, p_notas text default null::text
) returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
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
  v_costo_g numeric;
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
    where estado in ('abierto'::cierre_estado, 'en_proceso'::cierre_estado)
    order by periodo_anio desc, periodo_mes desc
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

    v_costo_g := coalesce(v_tolva.costo_promedio_g_actual, 0);
    if v_costo_g = 0 and v_tolva.producto_id is not null then
      select l.costo_por_gramo into v_costo_g
        from public.lotes l
        where l.producto_id = v_tolva.producto_id and l.activo = true
        order by l.created_at desc
        limit 1;
      v_costo_g := coalesce(v_costo_g, 0);
    end if;

    v_valor := round(v_diff * v_costo_g, 2);
    v_alerta := coalesce(v_diff_pct >= 5, false);

    insert into public.pesaje_tolva_items (
      pesaje_id, tolva_id, gramos_teoricos, gramos_medidos,
      diferencia_porcentaje, valor_diferencia, alerta_generada
    ) values (
      v_pesaje_id, v_tolva_id, v_tolva.inventario_actual_g, v_gramos_medidos,
      v_diff_pct, v_valor, v_alerta
    );

    if v_tolva.inventario_actual_g = 0
       and v_costo_g > 0
       and coalesce(v_tolva.costo_promedio_g_actual, 0) = 0 then
      update public.tolvas set
        inventario_actual_g = v_gramos_medidos,
        costo_promedio_g_actual = v_costo_g,
        ultimo_pesaje_at = now()
      where id = v_tolva_id;
    else
      update public.tolvas set
        inventario_actual_g = v_gramos_medidos,
        ultimo_pesaje_at = now()
      where id = v_tolva_id;
    end if;

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
        v_costo_g,
        v_valor,
        'pesaje_tolva_items', v_pesaje_id, v_uid
      );
    end if;
  end loop;

  return v_pesaje_id;
end;
$function$;


-- Backfill: para pesajes ya existentes con valor_diferencia=0 pero con delta
-- de gramos real (caso primer pesaje sin costo en tolva), recalcula el valor
-- usando el costo del último lote activo del producto.
with costos as (
  select t.id as tolva_id,
         (select l.costo_por_gramo
            from public.lotes l
            where l.producto_id = t.producto_id and l.activo = true
            order by l.created_at desc
            limit 1) as costo_g
    from public.tolvas t
)
update public.pesaje_tolva_items pti
   set valor_diferencia = round(
     (pti.gramos_medidos - pti.gramos_teoricos) * coalesce(c.costo_g, 0),
     2)
  from costos c
 where c.tolva_id = pti.tolva_id
   and pti.valor_diferencia = 0
   and (pti.gramos_medidos - pti.gramos_teoricos) <> 0
   and c.costo_g is not null;

-- Siembra costo_promedio_g_actual en tolvas que aún no lo tienen (alinea
-- el estado con el nuevo comportamiento de la función).
update public.tolvas t
   set costo_promedio_g_actual = (
     select l.costo_por_gramo
       from public.lotes l
       where l.producto_id = t.producto_id and l.activo = true
       order by l.created_at desc
       limit 1
   )
 where (t.costo_promedio_g_actual is null or t.costo_promedio_g_actual = 0)
   and t.producto_id is not null
   and exists (select 1 from public.lotes l where l.producto_id = t.producto_id and l.activo = true);
