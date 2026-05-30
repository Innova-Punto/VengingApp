-- ============================================================================
-- 38 · Ingesta de ventas Nayax
--
-- - RPC procesar_venta_nayax: idempotente por nayax_transaction_id, hace lookup
--   por nayax_machine_id + nayax_item_code, calcula costos y márgenes,
--   descuenta inventario de la tolva (y vaso si aplica), inserta kardex.
-- - RLS de inserción en ventas_maquina y nayax_sync_log a authenticated
--   (insert vía Service Route Handler con anon key, validado por secret).
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
  p_comision_pct numeric default 0.05
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_maquina record;
  v_tolva record;
  v_producto_id uuid;
  v_gramos int;
  v_costo_g numeric(12,6);
  v_costo_polvo numeric(14,2);
  v_costo_vaso numeric(14,2) := 0;
  v_comision numeric(14,2);
  v_precio_neto numeric(14,2);
  v_utilidad numeric(14,2);
  v_margen numeric(8,4);
  v_cierre_id uuid;
  v_venta_id uuid;
begin
  if p_nayax_transaction_id is null or p_nayax_transaction_id = '' then
    raise exception 'Falta nayax_transaction_id';
  end if;

  -- Idempotencia
  select id into v_venta_id from public.ventas_maquina where nayax_transaction_id = p_nayax_transaction_id;
  if v_venta_id is not null then return v_venta_id; end if;

  -- Lookup máquina (acepta nayax_machine_id o nayax_serial)
  select * into v_maquina from public.maquinas
   where activo = true and (nayax_machine_id = p_nayax_machine_id or nayax_serial = p_nayax_machine_id)
   limit 1;
  if v_maquina is null then
    raise exception 'Máquina con nayax_machine_id % no encontrada', p_nayax_machine_id;
  end if;

  -- Lookup tolva por código nayax y máquina
  select * into v_tolva from public.tolvas
   where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code
   limit 1;
  if v_tolva is null then
    raise exception 'Tolva con nayax_item_code % no encontrada en la máquina %',
      p_nayax_item_code, v_maquina.serie;
  end if;

  v_producto_id := v_tolva.producto_id;
  v_gramos := coalesce(v_tolva.gramaje_servicio, 0);
  v_costo_g := coalesce(v_tolva.costo_promedio_g_actual, 0);

  if v_gramos <= 0 then
    raise exception 'Tolva % no tiene gramaje_servicio configurado', v_tolva.id;
  end if;

  v_costo_polvo := round(v_gramos * v_costo_g, 2);
  v_comision := round(p_precio_bruto * p_comision_pct, 2);
  v_precio_neto := round(p_precio_bruto - v_comision, 2);

  -- Costo del vaso si la máquina vende vaso
  if v_maquina.vaso_producto_id is not null then
    -- Toma un costo promedio simple del producto vaso, ponderado por
    -- lotes activos disponibles. Si no hay info, costo_vaso = 0.
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

  -- Cierre activo (opcional, para que la venta quede atada)
  select id into v_cierre_id from public.cierres_mensuales
   where periodo_mes = extract(month from p_fecha_transaccion)::int
     and periodo_anio = extract(year from p_fecha_transaccion)::int
   limit 1;

  -- Inserta la venta
  insert into public.ventas_maquina (
    nayax_transaction_id, maquina_id, tolva_id, producto_id,
    fecha_transaccion, gramos_dispensados,
    precio_bruto, comision_nayax_estimada, precio_neto,
    costo_polvo, costo_vaso, utilidad_bruta, margen_porcentaje,
    metodo_pago, ticket_id_nayax,
    sync_log_id, cierre_id
  ) values (
    p_nayax_transaction_id, v_maquina.id, v_tolva.id, v_producto_id,
    p_fecha_transaccion, v_gramos,
    p_precio_bruto, v_comision, v_precio_neto,
    v_costo_polvo, v_costo_vaso, v_utilidad, v_margen,
    p_metodo_pago, p_ticket_id,
    p_sync_log_id, v_cierre_id
  ) returning id into v_venta_id;

  -- Descuenta tolva
  update public.tolvas
     set inventario_actual_g = greatest(0, inventario_actual_g - v_gramos)
   where id = v_tolva.id;

  -- Descuenta vaso si aplica
  if v_maquina.vaso_producto_id is not null then
    update public.maquinas
       set vaso_inventario_actual = greatest(0, vaso_inventario_actual - 1)
     where id = v_maquina.id;
  end if;

  -- Kardex
  if v_producto_id is not null then
    insert into public.movimientos_inventario (
      tipo, fecha, producto_id, maquina_id, tolva_id,
      presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, notas
    ) values (
      'venta_salida_tolva'::movimiento_tipo,
      p_fecha_transaccion, v_producto_id, v_maquina.id, v_tolva.id,
      'polvo_en_tolva'::mov_presentacion,
      0, case when v_maquina.vaso_producto_id is not null then -1 else 0 end, -v_gramos,
      v_costo_g, -v_costo_polvo,
      'ventas_maquina', v_venta_id, null,
      format('Venta Nayax %s', p_nayax_transaction_id)
    );
  end if;

  return v_venta_id;
end;
$$;

revoke all on function public.procesar_venta_nayax(
  text, text, text, timestamptz, numeric, text, text, uuid, numeric
) from public;
grant execute on function public.procesar_venta_nayax(
  text, text, text, timestamptz, numeric, text, text, uuid, numeric
) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RLS: ventas_maquina y nayax_sync_log
--   El webhook va a entrar con service_role (server-side) o anon validado por
--   secret en el endpoint. Para el endpoint con secret, exponemos inserts
--   vía RPC SECURITY DEFINER (procesar_venta_nayax) y un mini-RPC para
--   crear el sync log.
-- ----------------------------------------------------------------------------

create or replace function public.iniciar_sync_log_nayax(
  p_cursor_desde timestamptz default null,
  p_cursor_hasta timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  insert into public.nayax_sync_log (
    inicio, cursor_desde, cursor_hasta,
    transacciones_jaladas, transacciones_nuevas, transacciones_duplicadas,
    errores, estado
  ) values (
    now(), p_cursor_desde, p_cursor_hasta,
    0, 0, 0, 0, 'en_proceso'
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cerrar_sync_log_nayax(
  p_id uuid,
  p_jaladas int,
  p_nuevas int,
  p_duplicadas int,
  p_errores int,
  p_mensaje_error text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.nayax_sync_log
     set fin = now(),
         duracion_seg = extract(epoch from (now() - inicio))::int,
         transacciones_jaladas = p_jaladas,
         transacciones_nuevas = p_nuevas,
         transacciones_duplicadas = p_duplicadas,
         errores = p_errores,
         estado = case when p_errores > 0 then 'con_errores' else 'ok' end,
         mensaje_error = p_mensaje_error
   where id = p_id;
end;
$$;

revoke all on function public.iniciar_sync_log_nayax(timestamptz, timestamptz) from public;
revoke all on function public.cerrar_sync_log_nayax(uuid, int, int, int, int, text) from public;
grant execute on function public.iniciar_sync_log_nayax(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.cerrar_sync_log_nayax(uuid, int, int, int, int, text) to authenticated, service_role;
