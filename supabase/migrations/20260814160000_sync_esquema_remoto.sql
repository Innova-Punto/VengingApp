-- ============================================================================
-- 104 · Sincronización del esquema: vuelca a migraciones los cuerpos que solo
--       existían en el proyecto remoto
--
-- PROBLEMA
-- Cinco migraciones de jul-2026 (80 a 84) documentaron cambios pero dejaron el
-- DDL fuera del archivo con la nota "cuerpo aplicado en el remoto":
--
--   20260703010000_snapshot_por_producto.sql        → abrir/cerrar_cierre_mensual
--   20260703030000_ajuste_pesaje_faltante_sobrante  → vista_reporte_cierre
--   20260703040000_num_ventas_tickets.sql           → vista_reporte_cierre
--   20260703050000_consumo_incluye_vaso.sql         → vista_reporte_cierre
--   20260704010000_iva_ventas.sql                   → procesar_venta_nayax, agregar_ventas
--
-- Consecuencia: un `db:reset` (o levantar staging / recuperar de cero) producía
-- una base SIN esas definiciones — es decir, los cierres no encadenaban por
-- producto, la vista del reporte no traía faltante/sobrante ni contaba tickets,
-- y las ventas no calculaban IVA. El repo no reproducía producción.
--
-- SOLUCIÓN
-- Esta migración contiene las definiciones VIGENTES extraídas de producción el
-- 14-ago-2026 (pg_get_functiondef / pg_get_viewdef). Es idempotente y no
-- cambia nada en el proyecto remoto: reafirma lo que ya está corriendo.
--
-- REGLA A FUTURO: toda migración debe llevar su DDL completo. Si un cuerpo se
-- aplica primero en remoto, la migración correspondiente debe incluirlo antes
-- de hacer commit.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. abrir_cierre_mensual — inicio encadenado + snapshot por producto
--    (firma única: (int, int). El overload con p_force fue eliminado.)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.abrir_cierre_mensual(p_mes integer, p_anio integer)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_prev record;
  v_snap record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'Solo admin o dirección pueden abrir cierres';
  end if;
  if p_mes < 1 or p_mes > 12 then raise exception 'Mes inválido'; end if;
  if p_anio < 2024 or p_anio > 2100 then raise exception 'Año inválido'; end if;

  select id into v_id from public.cierres_mensuales where periodo_mes = p_mes and periodo_anio = p_anio;
  if v_id is not null then return v_id; end if;

  select * into v_prev from public.cierres_mensuales
   where estado = 'cerrado'::cierre_estado
     and (periodo_anio * 12 + periodo_mes) < (p_anio * 12 + p_mes)
   order by periodo_anio desc, periodo_mes desc limit 1;

  if v_prev.id is not null then
    insert into public.cierres_mensuales (
      periodo_mes, periodo_anio, estado, fecha_inicio_cierre,
      gramos_almacen_inicio, valor_almacen_inicio,
      gramos_maquinas_inicio, valor_maquinas_inicio,
      valor_vasos_almacen_inicio, valor_vasos_maquinas_inicio
    ) values (
      p_mes, p_anio, 'abierto'::cierre_estado, coalesce(v_prev.fecha_cierre, now()),
      v_prev.gramos_almacen_fin, v_prev.valor_almacen_fin,
      v_prev.gramos_maquinas_fin, v_prev.valor_maquinas_fin,
      v_prev.valor_vasos_almacen_fin, v_prev.valor_vasos_maquinas_fin
    ) returning id into v_id;

    -- Inicial por producto = final por producto del cierre anterior (encadenado)
    insert into public.cierre_snapshot_producto (
      cierre_id, momento, producto_id,
      alm_granel_gramos, alm_granel_valor,
      alm_cartuchos_unidades, alm_cartuchos_gramos, alm_cartuchos_valor,
      alm_vasos_unidades, alm_vasos_valor,
      maq_polvo_gramos, maq_polvo_valor,
      maq_vasos_unidades, maq_vasos_valor
    )
    select v_id, 'inicio', producto_id,
      alm_granel_gramos, alm_granel_valor,
      alm_cartuchos_unidades, alm_cartuchos_gramos, alm_cartuchos_valor,
      alm_vasos_unidades, alm_vasos_valor,
      maq_polvo_gramos, maq_polvo_valor,
      maq_vasos_unidades, maq_vasos_valor
    from public.cierre_snapshot_producto
    where cierre_id = v_prev.id and momento = 'fin';
  else
    select * into v_snap from public._snapshot_inventario_mxn();
    insert into public.cierres_mensuales (
      periodo_mes, periodo_anio, estado, fecha_inicio_cierre,
      gramos_almacen_inicio, valor_almacen_inicio,
      gramos_maquinas_inicio, valor_maquinas_inicio,
      valor_vasos_almacen_inicio, valor_vasos_maquinas_inicio
    ) values (
      p_mes, p_anio, 'abierto'::cierre_estado, now(),
      v_snap.gramos_almacen, v_snap.valor_almacen,
      v_snap.gramos_maquinas, v_snap.valor_maquinas,
      v_snap.valor_vasos_almacen, v_snap.valor_vasos_maquinas
    ) returning id into v_id;

    -- Inicial por producto = foto en vivo (bootstrap, solo el primer cierre)
    insert into public.cierre_snapshot_producto (
      cierre_id, momento, producto_id,
      alm_granel_gramos, alm_granel_valor,
      alm_cartuchos_unidades, alm_cartuchos_gramos, alm_cartuchos_valor,
      alm_vasos_unidades, alm_vasos_valor,
      maq_polvo_gramos, maq_polvo_valor,
      maq_vasos_unidades, maq_vasos_valor
    )
    select v_id, 'inicio', s.producto_id,
      s.alm_granel_gramos, s.alm_granel_valor,
      s.alm_cartuchos_unidades, s.alm_cartuchos_gramos, s.alm_cartuchos_valor,
      s.alm_vasos_unidades, s.alm_vasos_valor,
      s.maq_polvo_gramos, s.maq_polvo_valor,
      s.maq_vasos_unidades, s.maq_vasos_valor
    from public.snapshot_inventario_por_producto() s;
  end if;

  return v_id;
end;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. cerrar_cierre_mensual — cierra el periodo y guarda el final por producto
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.cerrar_cierre_mensual(p_cierre_id uuid, p_force boolean default false)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_cierre record;
  v_total_maquinas int;
  v_maquinas_pesadas int;
  v_pendientes_pesaje int;
  v_lista_pendientes text;
  v_snap record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'Solo admin o dirección pueden cerrar el periodo';
  end if;

  select * into v_cierre from public.cierres_mensuales where id = p_cierre_id for update;
  if v_cierre is null then raise exception 'Cierre no encontrado'; end if;
  if v_cierre.estado = 'cerrado'::cierre_estado then
    raise exception 'El cierre ya está cerrado';
  end if;

  select count(distinct m.id) into v_total_maquinas
    from public.maquinas m where m.activo = true and m.estado <> 'baja';
  select count(distinct pm.maquina_id) into v_maquinas_pesadas
    from public.pesajes_maquina pm where pm.cierre_id = p_cierre_id;
  v_pendientes_pesaje := v_total_maquinas - v_maquinas_pesadas;

  if v_pendientes_pesaje > 0 and not p_force then
    select string_agg(m.serie, ', ' order by m.serie) into v_lista_pendientes
      from public.maquinas m
     where m.activo = true and m.estado <> 'baja'
       and not exists (select 1 from public.pesajes_maquina pm
         where pm.cierre_id = p_cierre_id and pm.maquina_id = m.id);
    raise exception 'Faltan % máquinas por pesar: %. Usa el cierre forzado si quieres avanzar de todos modos.',
      v_pendientes_pesaje, v_lista_pendientes;
  end if;

  if not v_cierre.conteo_almacen_completado and not p_force then
    raise exception 'Falta el conteo de almacén. Aplícalo primero o usa cierre forzado.';
  end if;

  select * into v_snap from public._snapshot_inventario_mxn();

  update public.cierres_mensuales
     set estado = 'cerrado'::cierre_estado, fecha_cierre = now(), cerrado_por = v_uid,
         total_maquinas_periodo = v_total_maquinas, maquinas_pesadas = v_maquinas_pesadas,
         gramos_almacen_fin = v_snap.gramos_almacen, valor_almacen_fin = v_snap.valor_almacen,
         gramos_maquinas_fin = v_snap.gramos_maquinas, valor_maquinas_fin = v_snap.valor_maquinas,
         valor_vasos_almacen_fin = v_snap.valor_vasos_almacen,
         valor_vasos_maquinas_fin = v_snap.valor_vasos_maquinas
   where id = p_cierre_id;

  -- Snapshot FINAL por producto (para desglose por cliente / SKU)
  delete from public.cierre_snapshot_producto where cierre_id = p_cierre_id and momento = 'fin';
  insert into public.cierre_snapshot_producto (
    cierre_id, momento, producto_id,
    alm_granel_gramos, alm_granel_valor,
    alm_cartuchos_unidades, alm_cartuchos_gramos, alm_cartuchos_valor,
    alm_vasos_unidades, alm_vasos_valor,
    maq_polvo_gramos, maq_polvo_valor,
    maq_vasos_unidades, maq_vasos_valor
  )
  select p_cierre_id, 'fin', s.producto_id,
    s.alm_granel_gramos, s.alm_granel_valor,
    s.alm_cartuchos_unidades, s.alm_cartuchos_gramos, s.alm_cartuchos_valor,
    s.alm_vasos_unidades, s.alm_vasos_valor,
    s.maq_polvo_gramos, s.maq_polvo_valor,
    s.maq_vasos_unidades, s.maq_vasos_valor
  from public.snapshot_inventario_por_producto() s;

  return p_cierre_id;
end;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. vista_reporte_cierre — incluye:
--      · faltante vs sobrante de pesaje por separado (migración 81)
--      · num_ventas_nayax = tickets distintos, no movimientos (migración 82)
--      · consumo calculado incluye vasos (migración 83)
-- ────────────────────────────────────────────────────────────────────────────
drop view if exists public.vista_reporte_cierre;
create view public.vista_reporte_cierre as
 with movs as (
         select c_1.id as cierre_id,
            sum(case when mi.tipo = 'llenado_entrada_tolva'::movimiento_tipo then mi.gramos else 0 end) as gramos_enviados_maq,
            sum(case when mi.tipo = 'llenado_entrada_tolva'::movimiento_tipo then mi.valor_movimiento else 0::numeric end) as valor_enviado_maq,
            sum(case when mi.tipo = 'devolucion_entrada_cartucho'::movimiento_tipo then mi.gramos else 0 end) as gramos_devueltos,
            sum(case when mi.tipo = 'devolucion_entrada_cartucho'::movimiento_tipo then mi.valor_movimiento else 0::numeric end) as valor_devuelto,
            sum(case when mi.tipo = any (array['merma_ruta'::movimiento_tipo, 'merma_encartuchado'::movimiento_tipo]) then mi.gramos else 0 end) as gramos_merma,
            sum(case when mi.tipo = any (array['merma_ruta'::movimiento_tipo, 'merma_encartuchado'::movimiento_tipo]) then mi.valor_movimiento else 0::numeric end) as valor_merma,
            sum(case when mi.tipo = 'ajuste_conteo_almacen'::movimiento_tipo then mi.gramos else 0 end) as gramos_ajuste_almacen,
            sum(case when mi.tipo = 'ajuste_conteo_almacen'::movimiento_tipo then mi.valor_movimiento else 0::numeric end) as valor_ajuste_almacen,
            sum(case when mi.tipo = 'venta_salida_tolva'::movimiento_tipo then mi.gramos else 0 end) as gramos_venta,
            sum(case when mi.tipo = 'venta_salida_tolva'::movimiento_tipo then mi.valor_movimiento else 0::numeric end) as valor_venta,
            count(distinct case when mi.tipo = 'venta_salida_tolva'::movimiento_tipo then mi.referencia_id else null::uuid end) as num_ventas
           from cierres_mensuales c_1
             left join movimientos_inventario mi on mi.fecha >= c_1.fecha_inicio_cierre and mi.fecha < coalesce(c_1.fecha_cierre, now())
          group by c_1.id
        ), pes as (
         select pm.cierre_id,
            sum(mi.gramos) as gramos_ajuste_pesaje,
            sum(mi.valor_movimiento) as valor_ajuste_pesaje,
            sum(case when mi.valor_movimiento < 0::numeric then mi.gramos else 0 end) as gramos_pesaje_faltante,
            sum(case when mi.valor_movimiento < 0::numeric then mi.valor_movimiento else 0::numeric end) as valor_pesaje_faltante,
            sum(case when mi.valor_movimiento > 0::numeric then mi.gramos else 0 end) as gramos_pesaje_sobrante,
            sum(case when mi.valor_movimiento > 0::numeric then mi.valor_movimiento else 0::numeric end) as valor_pesaje_sobrante
           from pesajes_maquina pm
             join movimientos_inventario mi on mi.referencia_id = pm.id and mi.tipo = 'ajuste_conteo_maquina'::movimiento_tipo
          where pm.cierre_id is not null
          group by pm.cierre_id
        )
 select c.id as cierre_id,
    c.periodo_mes,
    c.periodo_anio,
    c.estado,
    c.fecha_inicio_cierre,
    c.fecha_cierre,
    c.gramos_almacen_inicio,
    (coalesce(c.valor_almacen_inicio, 0::numeric) + coalesce(c.valor_vasos_almacen_inicio, 0::numeric))::numeric(14,2) as valor_almacen_inicio,
    c.gramos_maquinas_inicio,
    (coalesce(c.valor_maquinas_inicio, 0::numeric) + coalesce(c.valor_vasos_maquinas_inicio, 0::numeric))::numeric(14,2) as valor_maquinas_inicio,
    (coalesce(c.valor_almacen_inicio, 0::numeric) + coalesce(c.valor_vasos_almacen_inicio, 0::numeric) + coalesce(c.valor_maquinas_inicio, 0::numeric) + coalesce(c.valor_vasos_maquinas_inicio, 0::numeric))::numeric(14,2) as valor_total_inicio,
    c.gramos_almacen_fin,
    (coalesce(c.valor_almacen_fin, 0::numeric) + coalesce(c.valor_vasos_almacen_fin, 0::numeric))::numeric(14,2) as valor_almacen_fin,
    c.gramos_maquinas_fin,
    (coalesce(c.valor_maquinas_fin, 0::numeric) + coalesce(c.valor_vasos_maquinas_fin, 0::numeric))::numeric(14,2) as valor_maquinas_fin,
    (coalesce(c.valor_almacen_fin, 0::numeric) + coalesce(c.valor_vasos_almacen_fin, 0::numeric) + coalesce(c.valor_maquinas_fin, 0::numeric) + coalesce(c.valor_vasos_maquinas_fin, 0::numeric))::numeric(14,2) as valor_total_fin,
    coalesce(c.valor_vasos_almacen_inicio, 0::numeric)::numeric(14,2) as valor_vasos_almacen_inicio,
    coalesce(c.valor_vasos_maquinas_inicio, 0::numeric)::numeric(14,2) as valor_vasos_maquinas_inicio,
    coalesce(c.valor_vasos_almacen_fin, 0::numeric)::numeric(14,2) as valor_vasos_almacen_fin,
    coalesce(c.valor_vasos_maquinas_fin, 0::numeric)::numeric(14,2) as valor_vasos_maquinas_fin,
    coalesce(abs(m.gramos_enviados_maq), 0::bigint) as gramos_enviados_maquinas,
    coalesce(abs(m.valor_enviado_maq), 0::numeric)::numeric(14,2) as valor_enviado_maquinas,
    coalesce(m.gramos_devueltos, 0::bigint) as gramos_devueltos,
    coalesce(m.valor_devuelto, 0::numeric)::numeric(14,2) as valor_devuelto,
    coalesce(abs(m.gramos_merma), 0::bigint) as gramos_merma,
    coalesce(abs(m.valor_merma), 0::numeric)::numeric(14,2) as valor_merma,
    coalesce(p.gramos_ajuste_pesaje, 0::bigint) as gramos_ajuste_pesaje,
    coalesce(p.valor_ajuste_pesaje, 0::numeric)::numeric(14,2) as valor_ajuste_pesaje,
    coalesce(p.gramos_pesaje_faltante, 0::bigint) as gramos_pesaje_faltante,
    coalesce(p.valor_pesaje_faltante, 0::numeric)::numeric(14,2) as valor_pesaje_faltante,
    coalesce(p.gramos_pesaje_sobrante, 0::bigint) as gramos_pesaje_sobrante,
    coalesce(p.valor_pesaje_sobrante, 0::numeric)::numeric(14,2) as valor_pesaje_sobrante,
    coalesce(m.gramos_ajuste_almacen, 0::bigint) as gramos_ajuste_almacen,
    coalesce(m.valor_ajuste_almacen, 0::numeric)::numeric(14,2) as valor_ajuste_almacen,
    coalesce(abs(m.gramos_venta), 0::bigint) as gramos_venta_nayax,
    coalesce(abs(m.valor_venta), 0::numeric)::numeric(14,2) as valor_venta_nayax,
    coalesce(m.num_ventas, 0::bigint)::integer as num_ventas_nayax,
    coalesce(c.gramos_maquinas_inicio, 0::bigint) + coalesce(abs(m.gramos_enviados_maq), 0::bigint) - coalesce(c.gramos_maquinas_fin, 0::bigint) as gramos_consumo_calculado,
    (coalesce(c.valor_maquinas_inicio, 0::numeric) + coalesce(c.valor_vasos_maquinas_inicio, 0::numeric) + coalesce(abs(m.valor_enviado_maq), 0::numeric) - coalesce(c.valor_maquinas_fin, 0::numeric) - coalesce(c.valor_vasos_maquinas_fin, 0::numeric))::numeric(14,2) as valor_consumo_calculado
   from cierres_mensuales c
     left join movs m on m.cierre_id = c.id
     left join pes p on p.cierre_id = c.id;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. agregar_ventas — KPIs del módulo de ventas, con IVA e ingreso sin IVA
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.agregar_ventas(
  p_desde timestamp with time zone,
  p_hasta timestamp with time zone,
  p_cliente_id uuid default null::uuid,
  p_maquina_id uuid default null::uuid,
  p_producto_id uuid default null::uuid,
  p_metodo text default null::text,
  p_solo_negativas boolean default false)
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
with vf as (
  select v.*, (v.fecha_transaccion at time zone 'America/Mexico_City')::date as dia_cdmx
    from public.ventas_maquina v
   where v.fecha_transaccion >= p_desde and v.fecha_transaccion <= p_hasta
     and (p_cliente_id is null or v.cliente_id = p_cliente_id)
     and (p_maquina_id is null or v.maquina_id = p_maquina_id)
     and (p_producto_id is null or v.producto_id = p_producto_id)
     and (p_metodo is null or v.metodo_pago = p_metodo)
     and (not p_solo_negativas or v.utilidad_bruta < 0)
),
kpis as (
  select jsonb_build_object(
    'n_ventas', count(*),
    'venta_publico', coalesce(sum(precio_bruto),0),
    'iva', coalesce(sum(iva),0),
    'ingreso_sin_iva', coalesce(sum(precio_sin_iva),0),
    'comision_nayax', coalesce(sum(comision_nayax_estimada),0),
    'venta_bruta', coalesce(sum(precio_neto),0),
    'costo_polvo', coalesce(sum(costo_polvo),0),
    'costo_vaso', coalesce(sum(costo_vaso),0),
    'utilidad', coalesce(sum(utilidad_bruta),0),
    'gramos', coalesce(sum(gramos_dispensados),0),
    'margen_prom', case when count(*)>0 then coalesce(avg(margen_porcentaje),0) else 0 end,
    'ticket_prom', case when count(*)>0 then coalesce(sum(precio_neto),0)/count(*) else 0 end
  ) j from vf
),
por_dia as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.fecha), '[]'::jsonb) j
  from (select dia_cdmx::text as fecha, sum(precio_neto) as ingresos from vf group by dia_cdmx) t
),
por_cliente as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.valor desc), '[]'::jsonb) j
  from (select coalesce(c.nombre,'(sin cliente)') as cliente, sum(vf.precio_neto) as valor
          from vf left join public.clientes c on c.id = vf.cliente_id
         group by coalesce(c.nombre,'(sin cliente)')) t
),
por_maquina as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.ingresos desc), '[]'::jsonb) j
  from (select vf.maquina_id as filter_id, m.serie, m.alias,
               sum(vf.precio_neto) as ingresos, sum(vf.utilidad_bruta) as utilidad, count(*) as ventas
          from vf join public.maquinas m on m.id = vf.maquina_id
         group by vf.maquina_id, m.serie, m.alias) t
),
por_producto as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.ingresos desc), '[]'::jsonb) j
  from (
    select coalesce(p.sku, 'receta') as sku,
           coalesce(p.nombre, regexp_replace(vf.notas, '^Receta:\s*', '')) as nombre,
           case when vf.producto_id is not null then vf.producto_id::text else '' end as filter_id,
           (vf.producto_id is null) as es_receta,
           sum(vf.precio_neto) as ingresos, sum(vf.utilidad_bruta) as utilidad, count(*) as ventas
      from vf left join public.productos p on p.id = vf.producto_id
     where vf.producto_id is not null or (vf.notas ~ '^Receta:')
     group by coalesce(p.sku,'receta'),
              coalesce(p.nombre, regexp_replace(vf.notas, '^Receta:\s*', '')),
              case when vf.producto_id is not null then vf.producto_id::text else '' end,
              (vf.producto_id is null)
  ) t
)
select jsonb_build_object(
  'kpis', (select j from kpis),
  'por_dia', (select j from por_dia),
  'por_cliente', (select j from por_cliente),
  'por_maquina', (select j from por_maquina),
  'por_producto', (select j from por_producto)
);
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. procesar_venta_nayax — ingesta idempotente con IVA y salida NEGATIVA
--    en el kardex (el bug de signo quedó corregido en la migración
--    20260725160000_venta_signo_salida_negativo.sql; este cuerpo lo refleja).
--
--    Maneja los dos tipos de máquina:
--      · preparado     → descompone la receta en ingredientes (venta_ingredientes)
--      · polvo_directo → PA code = tolva
--    Las máquinas tipo 'servicio' no reciben ventas por diseño.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.procesar_venta_nayax(
  p_nayax_transaction_id text,
  p_nayax_machine_id text,
  p_nayax_item_code text,
  p_fecha_transaccion timestamp with time zone,
  p_precio_bruto numeric,
  p_metodo_pago text default null::text,
  p_ticket_id text default null::text,
  p_sync_log_id uuid default null::uuid,
  p_comision_pct numeric default 0.0394)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_maquina record; v_tolva record; v_maquina_item record;
  v_cliente_id uuid; v_producto_id uuid; v_gramos int := 0;
  v_costo_polvo numeric(14,2) := 0; v_costo_vaso numeric(14,2) := 0;
  v_comision numeric(14,2); v_precio_neto numeric(14,2);
  v_iva numeric(14,2); v_precio_sin_iva numeric(14,2);
  v_utilidad numeric(14,2); v_margen numeric(8,4);
  v_cierre_id uuid; v_venta_id uuid; v_ingr record;
begin
  if p_nayax_transaction_id is null or p_nayax_transaction_id = '' then
    raise exception 'Falta nayax_transaction_id';
  end if;

  -- Idempotencia: si la transacción ya existe, devolverla sin reprocesar
  select id into v_venta_id from public.ventas_maquina where nayax_transaction_id = p_nayax_transaction_id;
  if v_venta_id is not null then return v_venta_id; end if;

  select * into v_maquina from public.maquinas
   where activo = true and (nayax_machine_id = p_nayax_machine_id or nayax_serial = p_nayax_machine_id)
   limit 1;
  if v_maquina is null then
    raise exception 'Máquina con nayax_machine_id % no encontrada', p_nayax_machine_id;
  end if;

  select u.cliente_id into v_cliente_id from public.ubicaciones u where u.id = v_maquina.ubicacion_id;

  -- ══ Máquina de bebidas preparadas (receta) ══
  if v_maquina.tipo = 'preparado' then
    select * into v_maquina_item from public.maquina_items
     where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code limit 1;
    if v_maquina_item is null then
      raise exception 'PA Code % no encontrado como receta en máquina % (preparado)', p_nayax_item_code, v_maquina.serie;
    end if;

    for v_ingr in
      select mi.tolva_id, mi.gramos, t.producto_id as ingrediente_producto_id,
             coalesce(t.costo_promedio_g_actual,0) as costo_g
        from public.maquina_item_ingredientes mi
        join public.tolvas t on t.id = mi.tolva_id
       where mi.maquina_item_id = v_maquina_item.id
    loop
      v_gramos := v_gramos + v_ingr.gramos;
      v_costo_polvo := v_costo_polvo + round(v_ingr.gramos * v_ingr.costo_g, 2);
    end loop;

    v_iva := round(p_precio_bruto * 16.0/116.0, 2);
    v_precio_sin_iva := round(p_precio_bruto / 1.16, 2);
    v_comision := round(p_precio_bruto * p_comision_pct, 2);   -- comisión sobre el precio CON IVA
    v_precio_neto := round(v_precio_sin_iva - v_comision, 2);

    if v_maquina.vaso_producto_id is not null then
      select coalesce(sum(l.unidades_disponibles * l.costo_por_gramo)/nullif(sum(l.unidades_disponibles),0),0)
        into v_costo_vaso
        from public.lotes l
       where l.producto_id = v_maquina.vaso_producto_id and l.activo = true and l.unidades_disponibles > 0;
      v_costo_vaso := round(v_costo_vaso, 2);
    end if;

    v_utilidad := round(v_precio_neto - v_costo_polvo - v_costo_vaso, 2);
    v_margen := case when v_precio_neto > 0 then round(v_utilidad / v_precio_neto * 100, 2) else null end;

    select id into v_cierre_id from public.cierres_mensuales
     where periodo_mes = extract(month from p_fecha_transaccion)::int
       and periodo_anio = extract(year from p_fecha_transaccion)::int limit 1;

    insert into public.ventas_maquina (
      nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id, fecha_transaccion,
      gramos_dispensados, precio_bruto, iva, precio_sin_iva, comision_nayax_estimada, precio_neto,
      costo_polvo, costo_vaso, utilidad_bruta, margen_porcentaje, metodo_pago, ticket_id_nayax,
      sync_log_id, cierre_id, notas)
    values (
      p_nayax_transaction_id, v_maquina.id, null, null, v_cliente_id, p_fecha_transaccion,
      v_gramos, p_precio_bruto, v_iva, v_precio_sin_iva, v_comision, v_precio_neto,
      v_costo_polvo, v_costo_vaso, v_utilidad, v_margen, p_metodo_pago, p_ticket_id,
      p_sync_log_id, v_cierre_id, 'Receta: ' || v_maquina_item.nombre)
    returning id into v_venta_id;

    for v_ingr in
      select mi.tolva_id, mi.gramos, t.producto_id as ingrediente_producto_id,
             coalesce(t.costo_promedio_g_actual,0) as costo_g
        from public.maquina_item_ingredientes mi
        join public.tolvas t on t.id = mi.tolva_id
       where mi.maquina_item_id = v_maquina_item.id
    loop
      insert into public.venta_ingredientes (venta_id, tolva_id, producto_id, gramos, costo)
      values (v_venta_id, v_ingr.tolva_id, v_ingr.ingrediente_producto_id, v_ingr.gramos,
              round(v_ingr.gramos * v_ingr.costo_g, 2));

      update public.tolvas set inventario_actual_g = greatest(0, inventario_actual_g - v_ingr.gramos)
       where id = v_ingr.tolva_id;

      if v_ingr.ingrediente_producto_id is not null then
        insert into public.movimientos_inventario (
          tipo, producto_id, maquina_id, tolva_id, presentacion, cantidad_cartuchos,
          cantidad_vasos, gramos, costo_por_gramo_snapshot, valor_movimiento,
          referencia_tabla, referencia_id, usuario_id, fecha)
        values ('venta_salida_tolva'::movimiento_tipo, v_ingr.ingrediente_producto_id, v_maquina.id,
                v_ingr.tolva_id, 'polvo_en_tolva'::mov_presentacion, 0, 0,
                -v_ingr.gramos, v_ingr.costo_g, -round(v_ingr.gramos * v_ingr.costo_g,2),
                'ventas_maquina', v_venta_id, null, p_fecha_transaccion);
      end if;
    end loop;

    if v_maquina.vaso_producto_id is not null then
      update public.maquinas set vaso_inventario_actual = greatest(0, vaso_inventario_actual - 1)
       where id = v_maquina.id;
      insert into public.movimientos_inventario (
        tipo, producto_id, maquina_id, presentacion, cantidad_cartuchos, cantidad_vasos,
        gramos, costo_por_gramo_snapshot, valor_movimiento, referencia_tabla, referencia_id,
        usuario_id, fecha)
      values ('venta_salida_tolva'::movimiento_tipo, v_maquina.vaso_producto_id, v_maquina.id,
              'vaso'::mov_presentacion, 0, -1, 0, 0, -v_costo_vaso,
              'ventas_maquina', v_venta_id, null, p_fecha_transaccion);
    end if;

    return v_venta_id;
  end if;

  -- ══ Máquina de polvo directo ══
  select * into v_tolva from public.tolvas
   where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code limit 1;
  if v_tolva is null then
    raise exception 'PA Code % no encontrado en máquina % (polvo_directo)', p_nayax_item_code, v_maquina.serie;
  end if;

  v_producto_id := v_tolva.producto_id;
  v_gramos := coalesce(v_tolva.gramaje_servicio, 0);
  if v_gramos <= 0 then
    raise exception 'Tolva % no tiene gramaje_servicio configurado', v_tolva.id;
  end if;

  v_costo_polvo := round(v_gramos * coalesce(v_tolva.costo_promedio_g_actual, 0), 2);
  v_iva := round(p_precio_bruto * 16.0/116.0, 2);
  v_precio_sin_iva := round(p_precio_bruto / 1.16, 2);
  v_comision := round(p_precio_bruto * p_comision_pct, 2);
  v_precio_neto := round(v_precio_sin_iva - v_comision, 2);

  if v_maquina.vaso_producto_id is not null then
    select coalesce(sum(l.unidades_disponibles * l.costo_por_gramo)/nullif(sum(l.unidades_disponibles),0),0)
      into v_costo_vaso
      from public.lotes l
     where l.producto_id = v_maquina.vaso_producto_id and l.activo = true and l.unidades_disponibles > 0;
    v_costo_vaso := round(v_costo_vaso, 2);
  end if;

  v_utilidad := round(v_precio_neto - v_costo_polvo - v_costo_vaso, 2);
  v_margen := case when v_precio_neto > 0 then round(v_utilidad / v_precio_neto * 100, 2) else null end;

  select id into v_cierre_id from public.cierres_mensuales
   where periodo_mes = extract(month from p_fecha_transaccion)::int
     and periodo_anio = extract(year from p_fecha_transaccion)::int limit 1;

  insert into public.ventas_maquina (
    nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id, fecha_transaccion,
    gramos_dispensados, precio_bruto, iva, precio_sin_iva, comision_nayax_estimada, precio_neto,
    costo_polvo, costo_vaso, utilidad_bruta, margen_porcentaje, metodo_pago, ticket_id_nayax,
    sync_log_id, cierre_id)
  values (
    p_nayax_transaction_id, v_maquina.id, v_tolva.id, v_producto_id, v_cliente_id, p_fecha_transaccion,
    v_gramos, p_precio_bruto, v_iva, v_precio_sin_iva, v_comision, v_precio_neto,
    v_costo_polvo, v_costo_vaso, v_utilidad, v_margen, p_metodo_pago, p_ticket_id,
    p_sync_log_id, v_cierre_id)
  returning id into v_venta_id;

  insert into public.venta_ingredientes (venta_id, tolva_id, producto_id, gramos, costo)
  values (v_venta_id, v_tolva.id, v_producto_id, v_gramos, v_costo_polvo);

  update public.tolvas set inventario_actual_g = greatest(0, inventario_actual_g - v_gramos)
   where id = v_tolva.id;

  if v_producto_id is not null then
    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id, tolva_id, presentacion, cantidad_cartuchos, cantidad_vasos,
      gramos, costo_por_gramo_snapshot, valor_movimiento, referencia_tabla, referencia_id,
      usuario_id, fecha)
    values ('venta_salida_tolva'::movimiento_tipo, v_producto_id, v_maquina.id, v_tolva.id,
            'polvo_en_tolva'::mov_presentacion, 0, 0,
            -v_gramos, coalesce(v_tolva.costo_promedio_g_actual,0), -v_costo_polvo,
            'ventas_maquina', v_venta_id, null, p_fecha_transaccion);
  end if;

  if v_maquina.vaso_producto_id is not null then
    update public.maquinas set vaso_inventario_actual = greatest(0, vaso_inventario_actual - 1)
     where id = v_maquina.id;
    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id, presentacion, cantidad_cartuchos, cantidad_vasos,
      gramos, costo_por_gramo_snapshot, valor_movimiento, referencia_tabla, referencia_id,
      usuario_id, fecha)
    values ('venta_salida_tolva'::movimiento_tipo, v_maquina.vaso_producto_id, v_maquina.id,
            'vaso'::mov_presentacion, 0, -1, 0, 0, -v_costo_vaso,
            'ventas_maquina', v_venta_id, null, p_fecha_transaccion);
  end if;

  return v_venta_id;
end;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. snapshot_inventario_desglosado — foto de inventario con desglose por
--    cliente (la usa el dashboard de dirección y el reporte de capital de
--    trabajo). Existía SOLO en el remoto: ninguna migración la creaba.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.snapshot_inventario_desglosado()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_almacen_granel_gramos bigint := 0;
  v_almacen_granel_valor numeric(14,2) := 0;
  v_almacen_cartuchos_unidades bigint := 0;
  v_almacen_cartuchos_gramos bigint := 0;
  v_almacen_cartuchos_valor numeric(14,2) := 0;
  v_almacen_vasos_unidades bigint := 0;
  v_almacen_vasos_valor numeric(14,2) := 0;
  v_maquinas_polvo_gramos bigint := 0;
  v_maquinas_polvo_valor numeric(14,2) := 0;
  v_maquinas_vasos_unidades bigint := 0;
  v_maquinas_vasos_valor numeric(14,2) := 0;
  v_por_cliente jsonb;
begin
  -- Almacén granel
  select coalesce(sum(l.gramos_disponibles_granel), 0),
         coalesce(sum(l.gramos_disponibles_granel * l.costo_por_gramo), 0)
    into v_almacen_granel_gramos, v_almacen_granel_valor
    from public.lotes l
    join public.productos p on p.id = l.producto_id
   where l.activo = true and p.tipo = 'polvo';

  -- Almacén cartuchos (encartuchados)
  select coalesce(sum(e.cantidad_disponible), 0),
         coalesce(sum(e.cantidad_disponible * e.gramos_por_cartucho), 0),
         coalesce(sum(e.cantidad_disponible * e.gramos_por_cartucho * e.costo_promedio_g), 0)
    into v_almacen_cartuchos_unidades, v_almacen_cartuchos_gramos, v_almacen_cartuchos_valor
    from public.encartuchados e;

  -- Almacén vasos (lotes de productos tipo vaso)
  select coalesce(sum(l.unidades_disponibles), 0),
         coalesce(sum(l.unidades_disponibles * l.costo_por_gramo), 0)
    into v_almacen_vasos_unidades, v_almacen_vasos_valor
    from public.lotes l
    join public.productos p on p.id = l.producto_id
   where l.activo = true and p.tipo = 'vaso';

  -- Máquinas: polvo en tolvas
  select coalesce(sum(t.inventario_actual_g), 0),
         coalesce(sum(t.inventario_actual_g * coalesce(t.costo_promedio_g_actual, 0)), 0)
    into v_maquinas_polvo_gramos, v_maquinas_polvo_valor
    from public.tolvas t
    join public.maquinas m on m.id = t.maquina_id
   where m.activo = true and t.producto_id is not null;

  -- Máquinas: vasos. Usar costo del último lote activo del producto vaso.
  select coalesce(sum(m.vaso_inventario_actual), 0),
         coalesce(sum(
           m.vaso_inventario_actual *
           (select l.costo_por_gramo from public.lotes l
             where l.producto_id = m.vaso_producto_id and l.activo = true
             order by l.created_at desc limit 1)
         ), 0)
    into v_maquinas_vasos_unidades, v_maquinas_vasos_valor
    from public.maquinas m
   where m.activo = true and m.vaso_producto_id is not null;

  -- Desglose por cliente: maquinas + tolvas + vasos
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.total desc), '[]'::jsonb)
    into v_por_cliente
    from (
      select c.nombre as cliente,
             count(distinct m.id) as maquinas,
             coalesce(sum(t.inventario_actual_g), 0) as gramos_polvo,
             coalesce(sum(t.inventario_actual_g * coalesce(t.costo_promedio_g_actual, 0)), 0) as valor_polvo,
             coalesce(sum(distinct m.vaso_inventario_actual), 0) as unidades_vasos,
             coalesce(sum(distinct
               m.vaso_inventario_actual *
               coalesce((select l.costo_por_gramo from public.lotes l
                  where l.producto_id = m.vaso_producto_id and l.activo = true
                  order by l.created_at desc limit 1), 0)
             ), 0) as valor_vasos,
             (coalesce(sum(t.inventario_actual_g * coalesce(t.costo_promedio_g_actual, 0)), 0)
              + coalesce(sum(distinct
                  m.vaso_inventario_actual *
                  coalesce((select l.costo_por_gramo from public.lotes l
                     where l.producto_id = m.vaso_producto_id and l.activo = true
                     order by l.created_at desc limit 1), 0)
                ), 0)) as total
        from public.clientes c
        join public.ubicaciones u on u.cliente_id = c.id
        join public.maquinas m on m.ubicacion_id = u.id
        left join public.tolvas t on t.maquina_id = m.id and t.producto_id is not null
       where c.activo = true and m.activo = true
       group by c.id, c.nombre
       having count(distinct m.id) > 0
    ) t;

  return jsonb_build_object(
    'almacen_granel_gramos', v_almacen_granel_gramos,
    'almacen_granel_valor', v_almacen_granel_valor,
    'almacen_cartuchos_unidades', v_almacen_cartuchos_unidades,
    'almacen_cartuchos_gramos', v_almacen_cartuchos_gramos,
    'almacen_cartuchos_valor', v_almacen_cartuchos_valor,
    'almacen_vasos_unidades', v_almacen_vasos_unidades,
    'almacen_vasos_valor', v_almacen_vasos_valor,
    'maquinas_polvo_gramos', v_maquinas_polvo_gramos,
    'maquinas_polvo_valor', v_maquinas_polvo_valor,
    'maquinas_vasos_unidades', v_maquinas_vasos_unidades,
    'maquinas_vasos_valor', v_maquinas_vasos_valor,
    'por_cliente', v_por_cliente
  );
end;
$function$;

revoke all on function public.snapshot_inventario_desglosado() from public;
grant execute on function public.snapshot_inventario_desglosado() to authenticated, service_role;
