-- ============================================================================
-- 149 · La venta sin PA Code se registra, no se tira (2/2: la lógica)
--
-- Cómo está armado, y por qué así
-- --------------------------------
-- En vez de reescribir `procesar_venta_nayax` —son ~8 KB y procesa las 86 mil
-- ventas del histórico— la función de siempre se renombra a
-- `procesar_venta_nayax_resuelta` y queda **intacta**, y enfrente se pone una
-- envoltura chica que decide a dónde va cada transacción:
--
--   1. ¿El PA Code existe en esa máquina?  → sí: delega, todo igual que antes.
--   2.                                       no: registra la venta marcada.
--
-- El camino que ya funcionaba no se toca. Era la parte que daba miedo mover.
--
-- Lo que la envoltura NO hace, a propósito: descontar polvo ni vaso. No
-- sabemos qué se despachó, y suponerlo ensuciaría el consumo teórico del
-- cierre, que es el número con el que se detectan las máquinas descalibradas.
-- El faltante aparecerá en el siguiente pesaje, y la marca dice por qué.
--
-- `utilidad_bruta` y `margen_porcentaje` quedan en null, no en cero: sin
-- costo, un cero haría que estas ventas se vieran con 100% de margen e
-- inflaría los indicadores. Null las deja fuera del promedio, que es lo
-- honesto.
--
-- Ojo con la regla de los overloads (CLAUDE.md §4.1): después de esta
-- migración hay UNA sola `procesar_venta_nayax`, la de 10 parámetros. La vieja
-- no quedó viva con otra firma — se renombró, que es distinto.
-- ============================================================================

alter function public.procesar_venta_nayax(
  text, text, text, timestamp with time zone, numeric, text, text, uuid, numeric
) rename to procesar_venta_nayax_resuelta;

comment on function public.procesar_venta_nayax_resuelta(
  text, text, text, timestamp with time zone, numeric, text, text, uuid, numeric
) is 'Procesa una venta cuyo PA Code YA se resolvió. No llamar directo: la puerta de entrada es procesar_venta_nayax, que decide si la transacción se puede identificar.';

create or replace function public.procesar_venta_nayax(
  p_nayax_transaction_id text,
  p_nayax_machine_id text,
  p_nayax_item_code text,
  p_fecha_transaccion timestamp with time zone,
  p_precio_bruto numeric,
  p_metodo_pago text default null,
  p_ticket_id text default null,
  p_sync_log_id uuid default null,
  p_comision_pct numeric default 0.0394,
  p_nombre_nayax text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_maq record; v_cliente uuid; v_cierre uuid; v_venta uuid;
  v_resuelve boolean := false;
begin
  -- Idempotencia: la misma transacción de Nayax puede llegar dos veces.
  select id into v_venta from public.ventas_maquina
   where nayax_transaction_id = p_nayax_transaction_id;
  if v_venta is not null then return v_venta; end if;

  select * into v_maq from public.maquinas
   where activo
     and (nayax_machine_id = p_nayax_machine_id or nayax_serial = p_nayax_machine_id)
   limit 1;
  if v_maq is null then
    raise exception 'Máquina con nayax_machine_id % no encontrada', p_nayax_machine_id;
  end if;

  -- ¿Se puede saber qué se vendió? Las de receta mapean contra maquina_items;
  -- las de polvo directo, contra el PA Code de la tolva.
  if p_nayax_item_code is not null then
    if v_maq.tipo = 'preparado' then
      select exists (
        select 1 from public.maquina_items
         where maquina_id = v_maq.id and nayax_item_code = p_nayax_item_code
      ) into v_resuelve;
    else
      select exists (
        select 1 from public.tolvas
         where maquina_id = v_maq.id and nayax_item_code = p_nayax_item_code
      ) into v_resuelve;
    end if;
  end if;

  if v_resuelve then
    return public.procesar_venta_nayax_resuelta(
      p_nayax_transaction_id, p_nayax_machine_id, p_nayax_item_code,
      p_fecha_transaccion, p_precio_bruto, p_metodo_pago, p_ticket_id,
      p_sync_log_id, p_comision_pct);
  end if;

  -- ══ SIN IDENTIFICAR: entra el dinero, no el consumo ══
  select u.cliente_id into v_cliente
    from public.ubicaciones u where u.id = v_maq.ubicacion_id;
  select id into v_cierre from public.cierres_mensuales
   where periodo_mes = extract(month from p_fecha_transaccion)::int
     and periodo_anio = extract(year from p_fecha_transaccion)::int
   limit 1;

  insert into public.ventas_maquina (
    nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id,
    fecha_transaccion, gramos_dispensados, precio_bruto, iva, precio_sin_iva,
    comision_nayax_estimada, precio_neto, costo_polvo, costo_vaso,
    utilidad_bruta, margen_porcentaje, metodo_pago, ticket_id_nayax,
    sync_log_id, cierre_id, notas, producto_sin_identificar
  ) values (
    p_nayax_transaction_id, v_maq.id, null, null, v_cliente, p_fecha_transaccion,
    0, p_precio_bruto,
    round(p_precio_bruto * 16.0/116.0, 2),
    round(p_precio_bruto / 1.16, 2),
    round(p_precio_bruto * p_comision_pct, 2),
    round(round(p_precio_bruto / 1.16, 2) - round(p_precio_bruto * p_comision_pct, 2), 2),
    0, 0, null, null, p_metodo_pago, p_ticket_id, p_sync_log_id, v_cierre,
    'SIN IDENTIFICAR' ||
      case when p_nombre_nayax is not null and p_nombre_nayax <> 'Unknown'
           then ' · Nayax dice: ' || p_nombre_nayax else '' end ||
      case when p_nayax_item_code is not null
           then ' · PA Code ' || p_nayax_item_code || ' no existe en esta máquina'
           else ' · llegó sin PA Code' end,
    true
  ) returning id into v_venta;

  return v_venta;
end;
$$;
