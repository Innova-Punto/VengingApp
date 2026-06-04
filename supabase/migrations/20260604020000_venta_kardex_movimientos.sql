-- ============================================================================
-- 57 · Kardex: cada venta Nayax registra movimiento_inventario
--
-- Antes el RPC procesar_venta_nayax descontaba inventario de tolvas y vasos
-- pero NO insertaba en movimientos_inventario. El kardex contable quedaba
-- ciego a las ventas, lo que falseaba reportes de COGS y mermas mensuales.
--
-- Ahora cada venta genera:
--   - 1 movimiento por cada tolva descontada (polvo)
--   - 1 movimiento por el vaso (si la máquina vende vaso)
-- Todo con tipo 'venta_salida_tolva' (que ya existía en el enum) y
-- referencia a ventas_maquina.
--
-- Backfill: se aplicó vía SQL ad-hoc para ventas previas a esta fecha.
-- ============================================================================

create or replace function public.procesar_venta_nayax(
  p_nayax_transaction_id text,
  p_nayax_machine_id text,
  p_nayax_item_code text,
  p_fecha_transaccion timestamptz,
  p_precio_bruto numeric,
  p_metodo_pago text default null,
  p_ticket_id text default null,
  p_sync_log_id uuid default null,
  p_comision_pct numeric default 0.0394
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_maquina record;
  v_tolva record;
  v_maquina_item record;
  v_cliente_id uuid;
  v_producto_id uuid;
  v_gramos int := 0;
  v_costo_polvo numeric(14,2) := 0;
  v_costo_vaso numeric(14,2) := 0;
  v_comision numeric(14,2);
  v_precio_neto numeric(14,2);
  v_utilidad numeric(14,2);
  v_margen numeric(8,4);
  v_cierre_id uuid;
  v_venta_id uuid;
  v_ingr record;
  v_costo_ingr numeric(14,2);
begin
  if p_nayax_transaction_id is null or p_nayax_transaction_id = '' then
    raise exception 'Falta nayax_transaction_id';
  end if;

  select id into v_venta_id from public.ventas_maquina
   where nayax_transaction_id = p_nayax_transaction_id;
  if v_venta_id is not null then return v_venta_id; end if;

  select * into v_maquina from public.maquinas
   where activo = true
     and (nayax_machine_id = p_nayax_machine_id or nayax_serial = p_nayax_machine_id)
   limit 1;
  if v_maquina is null then
    raise exception 'Máquina con nayax_machine_id % no encontrada', p_nayax_machine_id;
  end if;

  select u.cliente_id into v_cliente_id
    from public.ubicaciones u
   where u.id = v_maquina.ubicacion_id;

  if v_maquina.tipo = 'preparado' then
    select * into v_maquina_item from public.maquina_items
     where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code
     limit 1;
    if v_maquina_item is null then
      raise exception 'PA Code % no encontrado como receta en máquina % (preparado)',
        p_nayax_item_code, v_maquina.serie;
    end if;

    for v_ingr in
      select mi.tolva_id, mi.gramos,
             t.producto_id as ingrediente_producto_id,
             coalesce(t.costo_promedio_g_actual, 0) as costo_g
        from public.maquina_item_ingredientes mi
        join public.tolvas t on t.id = mi.tolva_id
       where mi.maquina_item_id = v_maquina_item.id
    loop
      v_gramos := v_gramos + v_ingr.gramos;
      v_costo_ingr := round(v_ingr.gramos * v_ingr.costo_g, 2);
      v_costo_polvo := v_costo_polvo + v_costo_ingr;
    end loop;

    v_comision := round(p_precio_bruto * p_comision_pct, 2);
    v_precio_neto := round(p_precio_bruto - v_comision, 2);

    if v_maquina.vaso_producto_id is not null then
      select coalesce(
        sum(l.unidades_disponibles * l.costo_por_gramo)
        / nullif(sum(l.unidades_disponibles), 0),
        0
      )
      into v_costo_vaso
      from public.lotes l
      where l.producto_id = v_maquina.vaso_producto_id
        and l.activo = true
        and l.unidades_disponibles > 0;
      v_costo_vaso := round(v_costo_vaso, 2);
    end if;

    v_utilidad := round(v_precio_neto - v_costo_polvo - v_costo_vaso, 2);
    v_margen := case
      when v_precio_neto > 0 then round(v_utilidad / v_precio_neto * 100, 2)
      else null
    end;

    select id into v_cierre_id from public.cierres_mensuales
     where periodo_mes = extract(month from p_fecha_transaccion)::int
       and periodo_anio = extract(year from p_fecha_transaccion)::int
     limit 1;

    insert into public.ventas_maquina (
      nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id,
      fecha_transaccion, gramos_dispensados,
      precio_bruto, comision_nayax_estimada, precio_neto,
      costo_polvo, costo_vaso, utilidad_bruta, margen_porcentaje,
      metodo_pago, ticket_id_nayax, sync_log_id, cierre_id,
      notas
    ) values (
      p_nayax_transaction_id, v_maquina.id, null, null, v_cliente_id,
      p_fecha_transaccion, v_gramos,
      p_precio_bruto, v_comision, v_precio_neto,
      v_costo_polvo, v_costo_vaso, v_utilidad, v_margen,
      p_metodo_pago, p_ticket_id, p_sync_log_id, v_cierre_id,
      'Receta: ' || v_maquina_item.nombre
    ) returning id into v_venta_id;

    for v_ingr in
      select mi.tolva_id, mi.gramos,
             t.producto_id as ingrediente_producto_id,
             coalesce(t.costo_promedio_g_actual, 0) as costo_g
        from public.maquina_item_ingredientes mi
        join public.tolvas t on t.id = mi.tolva_id
       where mi.maquina_item_id = v_maquina_item.id
    loop
      insert into public.venta_ingredientes (
        venta_id, tolva_id, producto_id, gramos, costo
      ) values (
        v_venta_id, v_ingr.tolva_id, v_ingr.ingrediente_producto_id,
        v_ingr.gramos, round(v_ingr.gramos * v_ingr.costo_g, 2)
      );

      update public.tolvas
         set inventario_actual_g = greatest(0, inventario_actual_g - v_ingr.gramos)
       where id = v_ingr.tolva_id;

      -- Kardex: salida de tolva (polvo). Skip si ingrediente sin producto_id.
      if v_ingr.ingrediente_producto_id is not null then
        insert into public.movimientos_inventario (
          tipo, producto_id, maquina_id, tolva_id,
          presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
          costo_por_gramo_snapshot, valor_movimiento,
          referencia_tabla, referencia_id, usuario_id, fecha
        ) values (
          'venta_salida_tolva'::movimiento_tipo,
          v_ingr.ingrediente_producto_id, v_maquina.id, v_ingr.tolva_id,
          'polvo_en_tolva'::mov_presentacion,
          0, 0, v_ingr.gramos,
          v_ingr.costo_g,
          round(v_ingr.gramos * v_ingr.costo_g, 2),
          'ventas_maquina', v_venta_id, null, p_fecha_transaccion
        );
      end if;
    end loop;

    if v_maquina.vaso_producto_id is not null then
      update public.maquinas
         set vaso_inventario_actual = greatest(0, vaso_inventario_actual - 1)
       where id = v_maquina.id;

      -- Kardex: salida de vaso
      insert into public.movimientos_inventario (
        tipo, producto_id, maquina_id,
        presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, fecha
      ) values (
        'venta_salida_tolva'::movimiento_tipo,
        v_maquina.vaso_producto_id, v_maquina.id,
        'vaso'::mov_presentacion,
        0, 1, 0,
        0, v_costo_vaso,
        'ventas_maquina', v_venta_id, null, p_fecha_transaccion
      );
    end if;

    return v_venta_id;
  end if;

  -- polvo_directo
  select * into v_tolva from public.tolvas
   where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code
   limit 1;
  if v_tolva is null then
    raise exception 'PA Code % no encontrado en máquina % (polvo_directo)',
      p_nayax_item_code, v_maquina.serie;
  end if;

  v_producto_id := v_tolva.producto_id;
  v_gramos := coalesce(v_tolva.gramaje_servicio, 0);

  if v_gramos <= 0 then
    raise exception 'Tolva % no tiene gramaje_servicio configurado', v_tolva.id;
  end if;

  v_costo_polvo := round(v_gramos * coalesce(v_tolva.costo_promedio_g_actual, 0), 2);
  v_comision := round(p_precio_bruto * p_comision_pct, 2);
  v_precio_neto := round(p_precio_bruto - v_comision, 2);

  if v_maquina.vaso_producto_id is not null then
    select coalesce(
      sum(l.unidades_disponibles * l.costo_por_gramo)
      / nullif(sum(l.unidades_disponibles), 0),
      0
    )
    into v_costo_vaso
    from public.lotes l
    where l.producto_id = v_maquina.vaso_producto_id
      and l.activo = true
      and l.unidades_disponibles > 0;
    v_costo_vaso := round(v_costo_vaso, 2);
  end if;

  v_utilidad := round(v_precio_neto - v_costo_polvo - v_costo_vaso, 2);
  v_margen := case
    when v_precio_neto > 0 then round(v_utilidad / v_precio_neto * 100, 2)
    else null
  end;

  select id into v_cierre_id from public.cierres_mensuales
   where periodo_mes = extract(month from p_fecha_transaccion)::int
     and periodo_anio = extract(year from p_fecha_transaccion)::int
   limit 1;

  insert into public.ventas_maquina (
    nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id,
    fecha_transaccion, gramos_dispensados,
    precio_bruto, comision_nayax_estimada, precio_neto,
    costo_polvo, costo_vaso, utilidad_bruta, margen_porcentaje,
    metodo_pago, ticket_id_nayax, sync_log_id, cierre_id
  ) values (
    p_nayax_transaction_id, v_maquina.id, v_tolva.id, v_producto_id, v_cliente_id,
    p_fecha_transaccion, v_gramos,
    p_precio_bruto, v_comision, v_precio_neto,
    v_costo_polvo, v_costo_vaso, v_utilidad, v_margen,
    p_metodo_pago, p_ticket_id, p_sync_log_id, v_cierre_id
  ) returning id into v_venta_id;

  insert into public.venta_ingredientes (
    venta_id, tolva_id, producto_id, gramos, costo
  ) values (
    v_venta_id, v_tolva.id, v_producto_id, v_gramos, v_costo_polvo
  );

  update public.tolvas
     set inventario_actual_g = greatest(0, inventario_actual_g - v_gramos)
   where id = v_tolva.id;

  -- Kardex: salida de tolva (polvo)
  if v_producto_id is not null then
    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id, tolva_id,
      presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, fecha
    ) values (
      'venta_salida_tolva'::movimiento_tipo,
      v_producto_id, v_maquina.id, v_tolva.id,
      'polvo_en_tolva'::mov_presentacion,
      0, 0, v_gramos,
      coalesce(v_tolva.costo_promedio_g_actual, 0),
      v_costo_polvo,
      'ventas_maquina', v_venta_id, null, p_fecha_transaccion
    );
  end if;

  if v_maquina.vaso_producto_id is not null then
    update public.maquinas
       set vaso_inventario_actual = greatest(0, vaso_inventario_actual - 1)
     where id = v_maquina.id;

    -- Kardex: salida de vaso
    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id,
      presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, fecha
    ) values (
      'venta_salida_tolva'::movimiento_tipo,
      v_maquina.vaso_producto_id, v_maquina.id,
      'vaso'::mov_presentacion,
      0, 1, 0,
      0, v_costo_vaso,
      'ventas_maquina', v_venta_id, null, p_fecha_transaccion
    );
  end if;

  return v_venta_id;
end;
$$;
