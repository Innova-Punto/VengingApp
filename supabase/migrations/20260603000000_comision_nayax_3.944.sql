-- ============================================================================
-- 51 · Ajusta comisión Nayax default: 3.4% + 16% IVA = 3.944%
--
-- Antes asumíamos 5% flat. Nayax cobra 3.4% sobre el bruto más 16% de IVA
-- sobre la comisión (3.4% × 1.16 = 3.944% efectivo).
--
-- Actualiza también la venta existente (si hay) para reflejar el cálculo
-- correcto. Si en el futuro Nayax cambia su comisión, basta otra migración.
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
    metodo_pago, ticket_id_nayax, sync_log_id, cierre_id
  ) values (
    p_nayax_transaction_id, v_maquina.id, v_tolva.id, v_producto_id,
    p_fecha_transaccion, v_gramos,
    p_precio_bruto, v_comision, v_precio_neto,
    v_costo_polvo, v_costo_vaso, v_utilidad, v_margen,
    p_metodo_pago, p_ticket_id, p_sync_log_id, v_cierre_id
  ) returning id into v_venta_id;

  return v_venta_id;
end;
$$;

-- Recalcula ventas existentes con la nueva tasa de comisión (3.944%).
-- Solo afecta a las que se procesaron con el viejo 5%.
update public.ventas_maquina
set
  comision_nayax_estimada = round(precio_bruto * 0.0394, 2),
  precio_neto = round(precio_bruto - round(precio_bruto * 0.0394, 2), 2),
  utilidad_bruta = round(
    (precio_bruto - round(precio_bruto * 0.0394, 2)) - costo_polvo - costo_vaso,
    2
  ),
  margen_porcentaje = case
    when (precio_bruto - round(precio_bruto * 0.0394, 2)) > 0 then
      round(
        ((precio_bruto - round(precio_bruto * 0.0394, 2)) - costo_polvo - costo_vaso)
        / (precio_bruto - round(precio_bruto * 0.0394, 2)) * 100,
        2
      )
    else null
  end
where precio_bruto > 0;
