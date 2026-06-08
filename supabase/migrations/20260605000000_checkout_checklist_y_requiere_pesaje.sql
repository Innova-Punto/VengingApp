-- ============================================================================
-- 58 · Checkout obligatorio (checklist + foto) y flag requiere_pesaje
--
-- Cambios al flujo del operador en campo:
--   1. Cada visita debe cerrar con: foto de salida + 3 preguntas yes/no
--      (Nayax activo, máquina limpia, productos activos).
--   2. Nuevo flag por máquina: requiere_pesaje. Si está activo, el
--      operador debe pesar tolvas antes de poder cerrar la visita
--      (aunque no haya cierre mensual abierto, pero sí lo necesita).
--   3. El orden Pesaje → Llenado → Checkout queda enforcado en UI.
-- ============================================================================

alter table public.maquinas
  add column if not exists requiere_pesaje boolean not null default false;

alter table public.check_ins
  add column if not exists foto_salida_url text,
  add column if not exists checkout_nayax_ok boolean,
  add column if not exists checkout_maquina_limpia boolean,
  add column if not exists checkout_productos_ok boolean;

-- RPC: cerrar visita sin llenado con datos de checkout
create or replace function public.op_cerrar_check_in_sin_llenado(
  p_check_in_id uuid,
  p_notas text default null,
  p_foto_salida_url text default null,
  p_checkout_nayax_ok boolean default null,
  p_checkout_maquina_limpia boolean default null,
  p_checkout_productos_ok boolean default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_operador uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select operador_id into v_operador
    from public.check_ins where id = p_check_in_id;
  if v_operador is null then
    raise exception 'Check-in no encontrado';
  end if;
  if v_operador <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para este check-in';
  end if;

  update public.check_ins set
    fecha_salida = now(),
    tiempo_en_sitio_seg = extract(epoch from (now() - fecha_entrada))::int,
    notas = coalesce(p_notas, notas),
    foto_salida_url = p_foto_salida_url,
    checkout_nayax_ok = p_checkout_nayax_ok,
    checkout_maquina_limpia = p_checkout_maquina_limpia,
    checkout_productos_ok = p_checkout_productos_ok
  where id = p_check_in_id;
end;
$$;

revoke all on function public.op_cerrar_check_in_sin_llenado(uuid, text, text, boolean, boolean, boolean) from public;
grant execute on function public.op_cerrar_check_in_sin_llenado(uuid, text, text, boolean, boolean, boolean) to authenticated;

-- RPC: registrar llenado con datos de checkout
create or replace function public.op_registrar_llenado(
  p_check_in_id uuid,
  p_items jsonb,
  p_evidencia_url text default null,
  p_notas text default null,
  p_vasos_cargados int default 0,
  p_foto_salida_url text default null,
  p_checkout_nayax_ok boolean default null,
  p_checkout_maquina_limpia boolean default null,
  p_checkout_productos_ok boolean default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_llenado_id uuid;
  v_maquina_id uuid;
  v_operador_id uuid;
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_tolva_id uuid;
  v_surtido_item_id uuid;
  v_cartuchos_cargados int;
  v_cartuchos_planeados int;
  v_cartuchos_no_usados int;
  v_encartuchado_id uuid;
  v_producto_id uuid;
  v_gramos_por_cartucho int;
  v_costo_g numeric(12,6);
  v_inv_antes int;
  v_costo_antes numeric(12,6);
  v_inv_despues int;
  v_costo_despues numeric(12,6);
  v_gramos_cargados int;
  v_llenado_item_id uuid;
  v_vasos_planeados int := 0;
  v_vaso_producto_id uuid;
  v_vaso_surtido_item_id uuid;
  v_vaso_costo numeric(12,6) := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select maquina_id, operador_id into v_maquina_id, v_operador_id
    from public.check_ins where id = p_check_in_id;

  if v_maquina_id is null then
    raise exception 'Check-in no encontrado';
  end if;

  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para este check-in';
  end if;

  select coalesce(sum(si.vasos_entregados), 0)
    into v_vasos_planeados
    from public.surtido_items si
    join public.surtidos s on s.id = si.surtido_id
   where si.maquina_id = v_maquina_id
     and s.asignacion_id = (select asignacion_id from public.check_ins where id = p_check_in_id);

  if p_vasos_cargados < 0 then
    raise exception 'vasos_cargados debe ser >= 0';
  end if;
  if p_vasos_cargados > v_vasos_planeados then
    raise exception 'No puede cargar % vasos: el surtido planeó solo %',
      p_vasos_cargados, v_vasos_planeados;
  end if;

  insert into public.llenados (
    check_in_id, maquina_id, operador_id, evidencia_url, notas,
    vasos_planeados, vasos_cargados
  )
  values (
    p_check_in_id, v_maquina_id, v_operador_id, p_evidencia_url, p_notas,
    v_vasos_planeados, p_vasos_cargados
  )
  returning id into v_llenado_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_tolva_id := (v_item->>'tolva_id')::uuid;
    v_surtido_item_id := (v_item->>'surtido_item_id')::uuid;
    v_cartuchos_cargados := coalesce((v_item->>'cartuchos_cargados')::int, 0);

    if v_cartuchos_cargados < 0 then
      raise exception 'cartuchos_cargados debe ser >= 0';
    end if;

    select cartuchos_entregados, encartuchado_id
      into v_cartuchos_planeados, v_encartuchado_id
      from public.surtido_items where id = v_surtido_item_id;

    if v_encartuchado_id is null then
      continue;
    end if;

    if v_cartuchos_cargados > v_cartuchos_planeados then
      raise exception 'No puede cargar % cartuchos: el surtido planeó solo %', v_cartuchos_cargados, v_cartuchos_planeados;
    end if;

    select gramos_por_cartucho, costo_promedio_g, producto_id
      into v_gramos_por_cartucho, v_costo_g, v_producto_id
      from public.encartuchados where id = v_encartuchado_id;

    v_gramos_cargados := v_cartuchos_cargados * v_gramos_por_cartucho;
    v_cartuchos_no_usados := v_cartuchos_planeados - v_cartuchos_cargados;

    select inventario_actual_g, costo_promedio_g_actual
      into v_inv_antes, v_costo_antes
      from public.tolvas where id = v_tolva_id;

    v_inv_despues := v_inv_antes + v_gramos_cargados;
    if v_inv_despues > 0 then
      v_costo_despues :=
        (v_inv_antes * v_costo_antes + v_gramos_cargados * v_costo_g)
        / v_inv_despues;
    else
      v_costo_despues := 0;
    end if;

    insert into public.llenado_items (
      llenado_id, tolva_id, surtido_item_id,
      cartuchos_planeados, cartuchos_cargados,
      gramos_cargados, encartuchado_id,
      inventario_tolva_antes, inventario_tolva_despues,
      costo_promedio_g_tolva_antes, costo_promedio_g_tolva_despues
    ) values (
      v_llenado_id, v_tolva_id, v_surtido_item_id,
      v_cartuchos_planeados, v_cartuchos_cargados,
      v_gramos_cargados, v_encartuchado_id,
      v_inv_antes, v_inv_despues,
      v_costo_antes, v_costo_despues
    ) returning id into v_llenado_item_id;

    update public.tolvas set
      inventario_actual_g = v_inv_despues,
      costo_promedio_g_actual = v_costo_despues,
      ultimo_llenado_at = now()
    where id = v_tolva_id;

    if v_gramos_cargados > 0 then
      insert into public.movimientos_inventario (
        tipo, producto_id, encartuchado_id, maquina_id, tolva_id,
        presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id
      ) values (
        'llenado_entrada_tolva'::movimiento_tipo,
        v_producto_id, v_encartuchado_id, v_maquina_id, v_tolva_id,
        'polvo_en_tolva'::mov_presentacion,
        v_cartuchos_cargados, 0, v_gramos_cargados,
        v_costo_g,
        round(v_gramos_cargados * v_costo_g, 2),
        'llenado_items', v_llenado_item_id, v_uid
      );
    end if;

    if v_cartuchos_no_usados > 0 then
      insert into public.devoluciones_almacen (
        llenado_item_id, operador_id,
        producto_id, encartuchado_id,
        cantidad_calculada, estado
      ) values (
        v_llenado_item_id, v_operador_id,
        v_producto_id, v_encartuchado_id,
        v_cartuchos_no_usados,
        'pendiente_devolucion'::devolucion_estado
      );
    end if;
  end loop;

  if p_vasos_cargados > 0 then
    select vaso_producto_id into v_vaso_producto_id
      from public.maquinas where id = v_maquina_id;

    select si.id, coalesce(l.costo_por_gramo, 0)
      into v_vaso_surtido_item_id, v_vaso_costo
      from public.surtido_items si
      join public.surtidos s on s.id = si.surtido_id
      left join public.lotes l on l.id = si.lote_vaso_id
     where si.maquina_id = v_maquina_id
       and si.vasos_entregados > 0
       and s.asignacion_id = (select asignacion_id from public.check_ins where id = p_check_in_id)
     limit 1;

    update public.maquinas set
      vaso_inventario_actual = least(
        vaso_capacidad_max,
        vaso_inventario_actual + p_vasos_cargados
      )
    where id = v_maquina_id;

    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id,
      presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id
    ) values (
      'llenado_entrada_tolva'::movimiento_tipo,
      v_vaso_producto_id, v_maquina_id,
      'vaso'::mov_presentacion,
      0, p_vasos_cargados, 0,
      v_vaso_costo,
      round(p_vasos_cargados * v_vaso_costo, 2),
      'llenados', v_llenado_id, v_uid
    );
  end if;

  update public.check_ins set
    fecha_salida = now(),
    tiempo_en_sitio_seg = extract(epoch from (now() - fecha_entrada))::int,
    foto_salida_url = p_foto_salida_url,
    checkout_nayax_ok = p_checkout_nayax_ok,
    checkout_maquina_limpia = p_checkout_maquina_limpia,
    checkout_productos_ok = p_checkout_productos_ok
  where id = p_check_in_id;

  return v_llenado_id;
end;
$$;

revoke all on function public.op_registrar_llenado(uuid, jsonb, text, text, int, text, boolean, boolean, boolean) from public;
grant execute on function public.op_registrar_llenado(uuid, jsonb, text, text, int, text, boolean, boolean, boolean) to authenticated;
