-- ============================================================================
-- RPC para registrar venta intercompany.
-- Aplica PEPS sobre lotes (granel o vaso), descuenta inventario, inserta el
-- registro con snapshots de costo/margen/precio/utilidad y genera movimiento
-- venta_intercompany en kardex.
-- ============================================================================

create or replace function public.registrar_venta_intercompany(
  p_empresa_destino_id uuid,
  p_producto_id uuid,
  p_presentacion venta_intercompany_presentacion,
  p_cantidad int,
  p_margen_porcentaje numeric,
  p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
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
    case when p_presentacion = 'vaso' then p_cantidad else 0 end,
    case when p_presentacion = 'granel' then p_cantidad else 0 end,
    v_costo_unitario_promedio,
    v_costo_total,
    'ventas_intercompany', v_venta_id, v_uid,
    'Venta intercompany'
  );

  return v_venta_id;
end;
$$;

grant execute on function public.registrar_venta_intercompany(uuid, uuid, venta_intercompany_presentacion, int, numeric, text) to authenticated;
