-- ============================================================================
-- 93 · Estandarizar el signo de la VENTA en el kardex (Opción 1)
--
-- Problema: toda salida en movimientos_inventario se guarda en NEGATIVO
-- (encartuchado_salida_granel, surtido_salida_cartucho, etc.), pero la VENTA
-- (venta_salida_tolva y venta_intercompany) se guardaba en POSITIVO. Eso hacía
-- que cualquier balance con signo (sum(gramos)) sumara la venta en vez de
-- restarla, inflando el saldo.
--
-- Fix: la venta se registra como salida NEGATIVA (gramos, cantidad_vasos y
-- valor_movimiento). La vista `vista_reporte_cierre` ya usa abs() sobre la
-- venta, así que el cierre no cambia. Se corrigen las funciones y se voltea
-- el histórico.
-- ============================================================================

-- 1) procesar_venta_nayax: los 4 inserts de venta_salida_tolva pasan a negativo
create or replace function public.procesar_venta_nayax(p_nayax_transaction_id text, p_nayax_machine_id text, p_nayax_item_code text, p_fecha_transaccion timestamp with time zone, p_precio_bruto numeric, p_metodo_pago text DEFAULT NULL::text, p_ticket_id text DEFAULT NULL::text, p_sync_log_id uuid DEFAULT NULL::uuid, p_comision_pct numeric DEFAULT 0.0394)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_maquina record; v_tolva record; v_maquina_item record;
  v_cliente_id uuid; v_producto_id uuid; v_gramos int := 0;
  v_costo_polvo numeric(14,2) := 0; v_costo_vaso numeric(14,2) := 0;
  v_comision numeric(14,2); v_precio_neto numeric(14,2);
  v_iva numeric(14,2); v_precio_sin_iva numeric(14,2);
  v_utilidad numeric(14,2); v_margen numeric(8,4);
  v_cierre_id uuid; v_venta_id uuid; v_ingr record; v_costo_ingr numeric(14,2);
begin
  if p_nayax_transaction_id is null or p_nayax_transaction_id = '' then
    raise exception 'Falta nayax_transaction_id'; end if;
  select id into v_venta_id from public.ventas_maquina where nayax_transaction_id = p_nayax_transaction_id;
  if v_venta_id is not null then return v_venta_id; end if;
  select * into v_maquina from public.maquinas
   where activo = true and (nayax_machine_id = p_nayax_machine_id or nayax_serial = p_nayax_machine_id) limit 1;
  if v_maquina is null then raise exception 'Máquina con nayax_machine_id % no encontrada', p_nayax_machine_id; end if;
  select u.cliente_id into v_cliente_id from public.ubicaciones u where u.id = v_maquina.ubicacion_id;

  if v_maquina.tipo = 'preparado' then
    select * into v_maquina_item from public.maquina_items
     where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code limit 1;
    if v_maquina_item is null then raise exception 'PA Code % no encontrado como receta en máquina % (preparado)', p_nayax_item_code, v_maquina.serie; end if;
    for v_ingr in
      select mi.tolva_id, mi.gramos, t.producto_id as ingrediente_producto_id, coalesce(t.costo_promedio_g_actual,0) as costo_g
        from public.maquina_item_ingredientes mi join public.tolvas t on t.id = mi.tolva_id
       where mi.maquina_item_id = v_maquina_item.id
    loop
      v_gramos := v_gramos + v_ingr.gramos;
      v_costo_polvo := v_costo_polvo + round(v_ingr.gramos * v_ingr.costo_g, 2);
    end loop;
    v_iva := round(p_precio_bruto * 16.0/116.0, 2);
    v_precio_sin_iva := round(p_precio_bruto / 1.16, 2);
    v_comision := round(p_precio_bruto * p_comision_pct, 2);
    v_precio_neto := round(v_precio_sin_iva - v_comision, 2);
    if v_maquina.vaso_producto_id is not null then
      select coalesce(sum(l.unidades_disponibles * l.costo_por_gramo)/nullif(sum(l.unidades_disponibles),0),0)
        into v_costo_vaso from public.lotes l
       where l.producto_id = v_maquina.vaso_producto_id and l.activo = true and l.unidades_disponibles > 0;
      v_costo_vaso := round(v_costo_vaso, 2);
    end if;
    v_utilidad := round(v_precio_neto - v_costo_polvo - v_costo_vaso, 2);
    v_margen := case when v_precio_neto > 0 then round(v_utilidad / v_precio_neto * 100, 2) else null end;
    select id into v_cierre_id from public.cierres_mensuales
     where periodo_mes = extract(month from p_fecha_transaccion)::int and periodo_anio = extract(year from p_fecha_transaccion)::int limit 1;
    insert into public.ventas_maquina (
      nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id, fecha_transaccion, gramos_dispensados,
      precio_bruto, iva, precio_sin_iva, comision_nayax_estimada, precio_neto,
      costo_polvo, costo_vaso, utilidad_bruta, margen_porcentaje,
      metodo_pago, ticket_id_nayax, sync_log_id, cierre_id, notas
    ) values (
      p_nayax_transaction_id, v_maquina.id, null, null, v_cliente_id, p_fecha_transaccion, v_gramos,
      p_precio_bruto, v_iva, v_precio_sin_iva, v_comision, v_precio_neto,
      v_costo_polvo, v_costo_vaso, v_utilidad, v_margen,
      p_metodo_pago, p_ticket_id, p_sync_log_id, v_cierre_id, 'Receta: ' || v_maquina_item.nombre
    ) returning id into v_venta_id;
    for v_ingr in
      select mi.tolva_id, mi.gramos, t.producto_id as ingrediente_producto_id, coalesce(t.costo_promedio_g_actual,0) as costo_g
        from public.maquina_item_ingredientes mi join public.tolvas t on t.id = mi.tolva_id
       where mi.maquina_item_id = v_maquina_item.id
    loop
      insert into public.venta_ingredientes (venta_id, tolva_id, producto_id, gramos, costo)
      values (v_venta_id, v_ingr.tolva_id, v_ingr.ingrediente_producto_id, v_ingr.gramos, round(v_ingr.gramos * v_ingr.costo_g, 2));
      update public.tolvas set inventario_actual_g = greatest(0, inventario_actual_g - v_ingr.gramos) where id = v_ingr.tolva_id;
      if v_ingr.ingrediente_producto_id is not null then
        insert into public.movimientos_inventario (tipo, producto_id, maquina_id, tolva_id, presentacion, cantidad_cartuchos, cantidad_vasos, gramos, costo_por_gramo_snapshot, valor_movimiento, referencia_tabla, referencia_id, usuario_id, fecha)
        values ('venta_salida_tolva'::movimiento_tipo, v_ingr.ingrediente_producto_id, v_maquina.id, v_ingr.tolva_id, 'polvo_en_tolva'::mov_presentacion, 0,0, -v_ingr.gramos, v_ingr.costo_g, -round(v_ingr.gramos * v_ingr.costo_g,2), 'ventas_maquina', v_venta_id, null, p_fecha_transaccion);
      end if;
    end loop;
    if v_maquina.vaso_producto_id is not null then
      update public.maquinas set vaso_inventario_actual = greatest(0, vaso_inventario_actual - 1) where id = v_maquina.id;
      insert into public.movimientos_inventario (tipo, producto_id, maquina_id, presentacion, cantidad_cartuchos, cantidad_vasos, gramos, costo_por_gramo_snapshot, valor_movimiento, referencia_tabla, referencia_id, usuario_id, fecha)
      values ('venta_salida_tolva'::movimiento_tipo, v_maquina.vaso_producto_id, v_maquina.id, 'vaso'::mov_presentacion, 0,-1,0, 0, -v_costo_vaso, 'ventas_maquina', v_venta_id, null, p_fecha_transaccion);
    end if;
    return v_venta_id;
  end if;

  select * into v_tolva from public.tolvas where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code limit 1;
  if v_tolva is null then raise exception 'PA Code % no encontrado en máquina % (polvo_directo)', p_nayax_item_code, v_maquina.serie; end if;
  v_producto_id := v_tolva.producto_id;
  v_gramos := coalesce(v_tolva.gramaje_servicio, 0);
  if v_gramos <= 0 then raise exception 'Tolva % no tiene gramaje_servicio configurado', v_tolva.id; end if;
  v_costo_polvo := round(v_gramos * coalesce(v_tolva.costo_promedio_g_actual, 0), 2);
  v_iva := round(p_precio_bruto * 16.0/116.0, 2);
  v_precio_sin_iva := round(p_precio_bruto / 1.16, 2);
  v_comision := round(p_precio_bruto * p_comision_pct, 2);
  v_precio_neto := round(v_precio_sin_iva - v_comision, 2);
  if v_maquina.vaso_producto_id is not null then
    select coalesce(sum(l.unidades_disponibles * l.costo_por_gramo)/nullif(sum(l.unidades_disponibles),0),0)
      into v_costo_vaso from public.lotes l
     where l.producto_id = v_maquina.vaso_producto_id and l.activo = true and l.unidades_disponibles > 0;
    v_costo_vaso := round(v_costo_vaso, 2);
  end if;
  v_utilidad := round(v_precio_neto - v_costo_polvo - v_costo_vaso, 2);
  v_margen := case when v_precio_neto > 0 then round(v_utilidad / v_precio_neto * 100, 2) else null end;
  select id into v_cierre_id from public.cierres_mensuales
   where periodo_mes = extract(month from p_fecha_transaccion)::int and periodo_anio = extract(year from p_fecha_transaccion)::int limit 1;
  insert into public.ventas_maquina (
    nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id, fecha_transaccion, gramos_dispensados,
    precio_bruto, iva, precio_sin_iva, comision_nayax_estimada, precio_neto,
    costo_polvo, costo_vaso, utilidad_bruta, margen_porcentaje,
    metodo_pago, ticket_id_nayax, sync_log_id, cierre_id
  ) values (
    p_nayax_transaction_id, v_maquina.id, v_tolva.id, v_producto_id, v_cliente_id, p_fecha_transaccion, v_gramos,
    p_precio_bruto, v_iva, v_precio_sin_iva, v_comision, v_precio_neto,
    v_costo_polvo, v_costo_vaso, v_utilidad, v_margen,
    p_metodo_pago, p_ticket_id, p_sync_log_id, v_cierre_id
  ) returning id into v_venta_id;
  insert into public.venta_ingredientes (venta_id, tolva_id, producto_id, gramos, costo)
  values (v_venta_id, v_tolva.id, v_producto_id, v_gramos, v_costo_polvo);
  update public.tolvas set inventario_actual_g = greatest(0, inventario_actual_g - v_gramos) where id = v_tolva.id;
  if v_producto_id is not null then
    insert into public.movimientos_inventario (tipo, producto_id, maquina_id, tolva_id, presentacion, cantidad_cartuchos, cantidad_vasos, gramos, costo_por_gramo_snapshot, valor_movimiento, referencia_tabla, referencia_id, usuario_id, fecha)
    values ('venta_salida_tolva'::movimiento_tipo, v_producto_id, v_maquina.id, v_tolva.id, 'polvo_en_tolva'::mov_presentacion, 0,0, -v_gramos, coalesce(v_tolva.costo_promedio_g_actual,0), -v_costo_polvo, 'ventas_maquina', v_venta_id, null, p_fecha_transaccion);
  end if;
  if v_maquina.vaso_producto_id is not null then
    update public.maquinas set vaso_inventario_actual = greatest(0, vaso_inventario_actual - 1) where id = v_maquina.id;
    insert into public.movimientos_inventario (tipo, producto_id, maquina_id, presentacion, cantidad_cartuchos, cantidad_vasos, gramos, costo_por_gramo_snapshot, valor_movimiento, referencia_tabla, referencia_id, usuario_id, fecha)
    values ('venta_salida_tolva'::movimiento_tipo, v_maquina.vaso_producto_id, v_maquina.id, 'vaso'::mov_presentacion, 0,-1,0, 0, -v_costo_vaso, 'ventas_maquina', v_venta_id, null, p_fecha_transaccion);
  end if;
  return v_venta_id;
end;
$function$;

-- 2) registrar_venta_intercompany: el movimiento pasa a salida negativa
create or replace function public.registrar_venta_intercompany(p_empresa_destino_id uuid, p_producto_id uuid, p_presentacion venta_intercompany_presentacion, p_cantidad integer, p_margen_porcentaje numeric, p_notas text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_venta_id uuid;
  v_costo_total numeric(14, 2) := 0;
  v_precio_venta numeric(14, 2);
  v_utilidad numeric(14, 2);
  v_costo_unitario_promedio numeric(12, 6);
  v_es_intercompany boolean;
  v_producto_tipo text;
  r record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role)
       or user_has_role('direccion'::app_role)
       or user_has_role('almacen'::app_role)) then
    raise exception 'Solo admin, dirección o almacén pueden registrar ventas intercompany.';
  end if;
  if p_cantidad <= 0 then
    raise exception 'cantidad debe ser > 0';
  end if;
  if p_margen_porcentaje < 0 then
    raise exception 'margen_porcentaje debe ser >= 0';
  end if;

  select es_intercompany into v_es_intercompany
    from public.clientes where id = p_empresa_destino_id;
  if v_es_intercompany is null then
    raise exception 'Cliente no encontrado';
  end if;
  if v_es_intercompany is not true then
    raise exception 'El cliente destino no está marcado como intercompany.';
  end if;

  select tipo into v_producto_tipo from public.productos where id = p_producto_id;
  if v_producto_tipo is null then
    raise exception 'Producto no encontrado';
  end if;
  if p_presentacion = 'vaso'::venta_intercompany_presentacion and v_producto_tipo <> 'vaso' then
    raise exception 'El producto no es de tipo vaso pero la presentación es vaso.';
  end if;
  if p_presentacion = 'granel'::venta_intercompany_presentacion and v_producto_tipo = 'vaso' then
    raise exception 'No se puede vender un producto vaso como granel.';
  end if;

  if p_presentacion = 'granel'::venta_intercompany_presentacion then
    for r in select * from public.pick_lote_peps_granel(p_producto_id, p_cantidad)
    loop
      update public.lotes
         set gramos_disponibles_granel = gramos_disponibles_granel - r.gramos_a_consumir
       where id = r.lote_id;
      v_costo_total := v_costo_total + round(r.gramos_a_consumir * r.costo_por_gramo, 2);
    end loop;
  else
    for r in select * from public.pick_lote_peps_vaso(p_producto_id, p_cantidad)
    loop
      update public.lotes
         set unidades_disponibles = unidades_disponibles - r.gramos_a_consumir
       where id = r.lote_id;
      v_costo_total := v_costo_total + round(r.gramos_a_consumir * r.costo_por_gramo, 2);
    end loop;
  end if;

  v_costo_unitario_promedio := round(v_costo_total / p_cantidad, 6);
  v_precio_venta := round(v_costo_total * (1 + p_margen_porcentaje / 100), 2);
  v_utilidad := v_precio_venta - v_costo_total;

  insert into public.ventas_intercompany (
    empresa_destino_id, producto_id, presentacion, cantidad,
    costo_unitario_snapshot, costo_total,
    margen_porcentaje, precio_venta_neto, utilidad,
    notas, usuario_id
  ) values (
    p_empresa_destino_id, p_producto_id, p_presentacion, p_cantidad,
    v_costo_unitario_promedio, v_costo_total,
    p_margen_porcentaje, v_precio_venta, v_utilidad,
    p_notas, v_uid
  )
  returning id into v_venta_id;

  -- Movimiento de inventario (salida = negativo)
  insert into public.movimientos_inventario (
    tipo, producto_id, presentacion,
    cantidad_cartuchos, cantidad_vasos, gramos,
    costo_por_gramo_snapshot, valor_movimiento,
    referencia_tabla, referencia_id, usuario_id, notas
  ) values (
    'venta_intercompany'::movimiento_tipo,
    p_producto_id,
    case when p_presentacion = 'vaso'::venta_intercompany_presentacion
         then 'vaso'::mov_presentacion
         else 'granel'::mov_presentacion end,
    0,
    case when p_presentacion = 'vaso' then -p_cantidad else 0 end,
    case when p_presentacion = 'granel' then -p_cantidad else 0 end,
    v_costo_unitario_promedio,
    -v_costo_total,
    'ventas_intercompany', v_venta_id, v_uid,
    'Venta intercompany'
  );

  return v_venta_id;
end;
$function$;

-- 3) Backfill del histórico: la venta pasa a negativa (idempotente con -abs()).
--    La vista de cierre usa abs(), así que los reportes no cambian.
update public.movimientos_inventario
   set gramos = -abs(gramos),
       cantidad_vasos = -abs(cantidad_vasos),
       valor_movimiento = -abs(valor_movimiento)
 where tipo in ('venta_salida_tolva'::movimiento_tipo, 'venta_intercompany'::movimiento_tipo);
