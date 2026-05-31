-- ============================================================================
-- 39 · Hotfix: RPCs de pesaje y conteo
--   - op_registrar_pesaje_maquina: no insertar en diferencia_gramos
--     (es GENERATED en pesaje_tolva_items).
--   - iniciar_conteo_almacen y aplicar_conteo_almacen: el estado válido es
--     'completado' (no 'aplicado'); el check constraint de conteos_almacen
--     solo acepta 'en_proceso' y 'completado'.
-- ============================================================================

create or replace function public.op_registrar_pesaje_maquina(
  p_check_in_id uuid,
  p_items jsonb,
  p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_maquina_id uuid;
  v_operador_id uuid;
  v_cierre_id uuid;
  v_pesaje_id uuid;
  v_item jsonb;
  v_tolva_id uuid;
  v_gramos_medidos int;
  v_foto text;
  v_item_notas text;
  v_gramos_teoricos int;
  v_costo_actual numeric(12,6);
  v_producto_id uuid;
  v_diferencia int;
  v_diferencia_pct numeric(8,2);
  v_valor numeric(14,2);
  v_alerta boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select maquina_id, operador_id into v_maquina_id, v_operador_id
    from public.check_ins where id = p_check_in_id;
  if v_maquina_id is null then raise exception 'Check-in no encontrado'; end if;
  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para este check-in';
  end if;
  select id into v_cierre_id from public.cierres_mensuales
    where estado in ('abierto'::cierre_estado, 'en_proceso'::cierre_estado)
    order by periodo_anio desc, periodo_mes desc limit 1;
  if v_cierre_id is null then
    raise exception 'No hay un cierre mensual abierto. Pide a dirección que lo abra.';
  end if;

  insert into public.pesajes_maquina (cierre_id, maquina_id, check_in_id, operador_id, notas)
  values (v_cierre_id, v_maquina_id, p_check_in_id, v_operador_id, p_notas)
  returning id into v_pesaje_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tolva_id := (v_item->>'tolva_id')::uuid;
    v_gramos_medidos := coalesce((v_item->>'gramos_medidos')::int, -1);
    v_foto := v_item->>'foto_url';
    v_item_notas := v_item->>'notas';
    if v_gramos_medidos < 0 then
      raise exception 'gramos_medidos debe ser >= 0 para la tolva %', v_tolva_id;
    end if;

    select inventario_actual_g, costo_promedio_g_actual, producto_id
      into v_gramos_teoricos, v_costo_actual, v_producto_id
      from public.tolvas where id = v_tolva_id for update;
    if v_gramos_teoricos is null then raise exception 'Tolva % no encontrada', v_tolva_id; end if;

    v_diferencia := v_gramos_medidos - v_gramos_teoricos;
    v_diferencia_pct := case
      when v_gramos_teoricos > 0
        then round(v_diferencia::numeric / v_gramos_teoricos * 100, 2)
      else null
    end;
    v_valor := round(v_diferencia * v_costo_actual, 2);
    v_alerta := abs(coalesce(v_diferencia_pct, 0)) >= 5;

    -- diferencia_gramos es GENERATED ALWAYS (gramos_medidos - gramos_teoricos); no insertar
    insert into public.pesaje_tolva_items (
      pesaje_id, tolva_id, gramos_medidos, gramos_teoricos,
      diferencia_porcentaje, valor_diferencia,
      foto_url, alerta_generada, notas
    ) values (
      v_pesaje_id, v_tolva_id, v_gramos_medidos, v_gramos_teoricos,
      v_diferencia_pct, v_valor,
      v_foto, v_alerta, v_item_notas
    );

    update public.tolvas
       set inventario_actual_g = v_gramos_medidos,
           ultimo_pesaje_at = now()
     where id = v_tolva_id;

    if v_diferencia <> 0 and v_producto_id is not null then
      insert into public.movimientos_inventario (
        tipo, producto_id, maquina_id, tolva_id,
        presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas
      ) values (
        'ajuste_conteo_maquina'::movimiento_tipo,
        v_producto_id, v_maquina_id, v_tolva_id,
        'polvo_en_tolva'::mov_presentacion,
        0, 0, v_diferencia,
        v_costo_actual, v_valor,
        'pesaje_tolva_items', v_pesaje_id, v_uid,
        format('Ajuste por pesaje: %s g vs %s g teóricos', v_gramos_medidos, v_gramos_teoricos)
      );
    end if;
  end loop;
  return v_pesaje_id;
end;
$$;
grant execute on function public.op_registrar_pesaje_maquina(uuid, jsonb, text) to authenticated;

-- Conteos: usa estados válidos del check constraint ('en_proceso','completado')

create or replace function public.iniciar_conteo_almacen(p_cierre_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_estado cierre_estado;
  v_conteo_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role) or user_has_role('almacen'::app_role)) then
    raise exception 'Solo almacén, admin o dirección pueden iniciar conteos';
  end if;
  select estado into v_estado from public.cierres_mensuales where id = p_cierre_id;
  if v_estado is null then raise exception 'Cierre no encontrado'; end if;
  if v_estado = 'cerrado'::cierre_estado then raise exception 'El cierre ya está cerrado'; end if;
  select id into v_conteo_id from public.conteos_almacen where cierre_id = p_cierre_id and estado = 'en_proceso';
  if v_conteo_id is not null then return v_conteo_id; end if;
  insert into public.conteos_almacen (cierre_id, fecha, realizado_por, estado)
  values (p_cierre_id, now(), v_uid, 'en_proceso') returning id into v_conteo_id;
  insert into public.conteo_granel_items (conteo_id, lote_id, gramos_sistema, gramos_fisicos)
  select v_conteo_id, l.id, l.gramos_disponibles_granel, 0 from public.lotes l
   where l.activo = true and l.gramos_disponibles_granel is not null and l.gramos_disponibles_granel > 0;
  insert into public.conteo_cartuchos_items (conteo_id, producto_id, encartuchado_id, cantidad_sistema, cantidad_fisica)
  select v_conteo_id, e.producto_id, e.id, e.cantidad_disponible, 0 from public.encartuchados e where e.cantidad_disponible > 0;
  return v_conteo_id;
end;
$$;
grant execute on function public.iniciar_conteo_almacen(uuid) to authenticated;

create or replace function public.aplicar_conteo_almacen(p_conteo_id uuid, p_granel jsonb, p_cartuchos jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_conteo record;
  v_item jsonb;
  v_item_id uuid;
  v_gramos_fisicos int;
  v_cantidad_fisica int;
  v_lote record;
  v_enc record;
  v_diferencia int;
  v_valor numeric(14,2);
  v_costo numeric(12,6);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role) or user_has_role('almacen'::app_role)) then
    raise exception 'Solo almacén, admin o dirección pueden aplicar conteos';
  end if;
  select * into v_conteo from public.conteos_almacen where id = p_conteo_id for update;
  if v_conteo is null then raise exception 'Conteo no encontrado'; end if;
  if v_conteo.estado <> 'en_proceso' then raise exception 'El conteo ya fue aplicado o cancelado (estado: %)', v_conteo.estado; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_granel, '[]'::jsonb)) loop
    v_item_id := (v_item->>'id')::uuid;
    v_gramos_fisicos := coalesce((v_item->>'gramos_fisicos')::int, 0);
    if v_gramos_fisicos < 0 then raise exception 'gramos_fisicos debe ser >= 0'; end if;
    select l.* into v_lote from public.lotes l join public.conteo_granel_items cgi on cgi.lote_id = l.id where cgi.id = v_item_id for update;
    if v_lote is null then continue; end if;
    v_diferencia := v_gramos_fisicos - coalesce(v_lote.gramos_disponibles_granel, 0);
    v_costo := coalesce(v_lote.costo_por_gramo, 0);
    v_valor := round(v_diferencia * v_costo, 2);
    update public.conteo_granel_items set gramos_fisicos = v_gramos_fisicos, valor_diferencia = v_valor where id = v_item_id;
    if v_diferencia <> 0 then
      update public.lotes set gramos_disponibles_granel = v_gramos_fisicos where id = v_lote.id;
      insert into public.movimientos_inventario (tipo, producto_id, lote_id, presentacion, cantidad_cartuchos, cantidad_vasos, gramos, costo_por_gramo_snapshot, valor_movimiento, referencia_tabla, referencia_id, usuario_id, notas)
      values ('ajuste_conteo_almacen'::movimiento_tipo, v_lote.producto_id, v_lote.id, 'granel'::mov_presentacion, 0, 0, v_diferencia, v_costo, v_valor, 'conteo_granel_items', v_item_id, v_uid,
              format('Conteo granel: físico %s g vs sistema %s g', v_gramos_fisicos, v_lote.gramos_disponibles_granel));
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_cartuchos, '[]'::jsonb)) loop
    v_item_id := (v_item->>'id')::uuid;
    v_cantidad_fisica := coalesce((v_item->>'cantidad_fisica')::int, 0);
    if v_cantidad_fisica < 0 then raise exception 'cantidad_fisica debe ser >= 0'; end if;
    select e.* into v_enc from public.encartuchados e join public.conteo_cartuchos_items cci on cci.encartuchado_id = e.id where cci.id = v_item_id for update;
    if v_enc is null then continue; end if;
    v_diferencia := v_cantidad_fisica - v_enc.cantidad_disponible;
    v_costo := coalesce(v_enc.costo_promedio_g, 0);
    v_valor := round(v_diferencia * v_enc.gramos_por_cartucho * v_costo, 2);
    update public.conteo_cartuchos_items set cantidad_fisica = v_cantidad_fisica, valor_diferencia = v_valor where id = v_item_id;
    if v_diferencia <> 0 then
      update public.encartuchados set cantidad_disponible = v_cantidad_fisica where id = v_enc.id;
      insert into public.movimientos_inventario (tipo, producto_id, encartuchado_id, presentacion, cantidad_cartuchos, cantidad_vasos, gramos, costo_por_gramo_snapshot, valor_movimiento, referencia_tabla, referencia_id, usuario_id, notas)
      values ('ajuste_conteo_almacen'::movimiento_tipo, v_enc.producto_id, v_enc.id, 'cartucho'::mov_presentacion, v_diferencia, 0, v_diferencia * v_enc.gramos_por_cartucho, v_costo, v_valor, 'conteo_cartuchos_items', v_item_id, v_uid,
              format('Conteo cartuchos: físico %s vs sistema %s', v_cantidad_fisica, v_enc.cantidad_disponible));
    end if;
  end loop;

  update public.conteos_almacen set estado = 'completado' where id = p_conteo_id;
  update public.cierres_mensuales set conteo_almacen_completado = true where id = v_conteo.cierre_id;
  return p_conteo_id;
end;
$$;
grant execute on function public.aplicar_conteo_almacen(uuid, jsonb, jsonb) to authenticated;
