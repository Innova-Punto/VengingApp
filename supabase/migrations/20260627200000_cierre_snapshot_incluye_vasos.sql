-- ============================================================================
-- 72 · El snapshot del cierre mensual ahora incluye el valor de los vasos
--
-- Problema: _snapshot_inventario_mxn() (que alimenta el inventario inicio/fin
-- del cierre y la vista vista_reporte_cierre) solo valoraba POLVO (granel +
-- cartuchos + tolvas) e ignoraba el inventario de vasos. Eso hacía que el
-- inventario global del cierre quedara subvaluado (~$88k) y NO cuadrara con la
-- pestaña de inventario ni con el reporte por cliente (capital_trabajo), que sí
-- cuentan vasos.
--
-- Solución: el snapshot también valora los vasos, usando EXACTAMENTE la misma
-- lógica que public.capital_trabajo(). El valor de vasos se guarda en columnas
-- SEPARADAS para no contaminar el cálculo de consumo de polvo (que sigue siendo
-- inicio_polvo + enviado_polvo - fin_polvo). La vista suma vasos solo en los
-- totales de inventario que se muestran en pantalla.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas separadas para el valor de vasos (almacén y máquinas)
-- ----------------------------------------------------------------------------

alter table public.cierres_mensuales
  add column if not exists valor_vasos_almacen_inicio  numeric(14,2),
  add column if not exists valor_vasos_maquinas_inicio numeric(14,2),
  add column if not exists valor_vasos_almacen_fin      numeric(14,2),
  add column if not exists valor_vasos_maquinas_fin     numeric(14,2);

-- ----------------------------------------------------------------------------
-- 2. _snapshot_inventario_mxn: ahora también devuelve el valor de vasos
--    (mismo cálculo que capital_trabajo). El polvo queda igual que antes.
-- ----------------------------------------------------------------------------

create or replace function public._snapshot_inventario_mxn()
returns table (
  gramos_almacen        bigint,
  valor_almacen         numeric(14,2),
  gramos_maquinas       bigint,
  valor_maquinas        numeric(14,2),
  valor_vasos_almacen   numeric(14,2),
  valor_vasos_maquinas  numeric(14,2)
) language sql stable security definer set search_path = public, pg_temp as $$
  with alm_granel as (
    select coalesce(sum(l.gramos_disponibles_granel), 0)::bigint as gramos,
           coalesce(sum(l.gramos_disponibles_granel * coalesce(l.costo_por_gramo, 0)), 0)::numeric(14,2) as valor
      from public.lotes l
      join public.productos p on p.id = l.producto_id
     where l.activo = true and p.tipo = 'polvo'
  ),
  alm_cartuchos as (
    select coalesce(sum(e.cantidad_disponible * e.gramos_por_cartucho), 0)::bigint as gramos,
           coalesce(sum(e.cantidad_disponible * e.gramos_por_cartucho * coalesce(e.costo_promedio_g, 0)), 0)::numeric(14,2) as valor
      from public.encartuchados e
     where e.cantidad_disponible > 0
  ),
  alm_vasos as (
    select coalesce(sum(l.unidades_disponibles * coalesce(l.costo_por_gramo, 0)), 0)::numeric(14,2) as valor
      from public.lotes l
      join public.productos p on p.id = l.producto_id
     where l.activo = true and p.tipo = 'vaso' and l.unidades_disponibles is not null
  ),
  maq_polvo as (
    select coalesce(sum(t.inventario_actual_g), 0)::bigint as gramos,
           coalesce(sum(t.inventario_actual_g * coalesce(t.costo_promedio_g_actual, 0)), 0)::numeric(14,2) as valor
      from public.tolvas t
     where t.inventario_actual_g > 0
  ),
  vaso_costos as (
    select producto_id,
           sum(unidades_disponibles * costo_por_gramo) / nullif(sum(unidades_disponibles), 0) as costo_unit
      from public.lotes
     where activo = true and unidades_disponibles is not null
     group by producto_id
  ),
  maq_vasos as (
    select coalesce(sum(m.vaso_inventario_actual * vc.costo_unit), 0)::numeric(14,2) as valor
      from public.maquinas m
      left join vaso_costos vc on vc.producto_id = m.vaso_producto_id
     where m.vaso_producto_id is not null
  )
  select
    (ag.gramos + ac.gramos)::bigint   as gramos_almacen,
    (ag.valor + ac.valor)::numeric(14,2) as valor_almacen,
    mp.gramos                          as gramos_maquinas,
    mp.valor                           as valor_maquinas,
    av.valor                           as valor_vasos_almacen,
    mv.valor                           as valor_vasos_maquinas
  from alm_granel ag, alm_cartuchos ac, alm_vasos av, maq_polvo mp, maq_vasos mv;
$$;
grant execute on function public._snapshot_inventario_mxn() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. abrir_cierre_mensual: guarda también el valor de vasos al inicio
-- ----------------------------------------------------------------------------

create or replace function public.abrir_cierre_mensual(
  p_mes int, p_anio int
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
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

  return v_id;
end;
$$;
grant execute on function public.abrir_cierre_mensual(int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. cerrar_cierre_mensual: guarda también el valor de vasos al cierre
-- ----------------------------------------------------------------------------

create or replace function public.cerrar_cierre_mensual(
  p_cierre_id uuid,
  p_force boolean default false
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
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

  -- Validar 100% pesaje
  select count(distinct m.id) into v_total_maquinas
    from public.maquinas m where m.activo = true and m.estado <> 'baja';

  select count(distinct pm.maquina_id) into v_maquinas_pesadas
    from public.pesajes_maquina pm where pm.cierre_id = p_cierre_id;

  v_pendientes_pesaje := v_total_maquinas - v_maquinas_pesadas;

  if v_pendientes_pesaje > 0 and not p_force then
    select string_agg(m.serie, ', ' order by m.serie) into v_lista_pendientes
      from public.maquinas m
     where m.activo = true and m.estado <> 'baja'
       and not exists (
         select 1 from public.pesajes_maquina pm
         where pm.cierre_id = p_cierre_id and pm.maquina_id = m.id
       );
    raise exception 'Faltan % máquinas por pesar: %. Usa el cierre forzado si quieres avanzar de todos modos.',
      v_pendientes_pesaje, v_lista_pendientes;
  end if;

  if not v_cierre.conteo_almacen_completado and not p_force then
    raise exception 'Falta el conteo de almacén. Aplícalo primero o usa cierre forzado.';
  end if;

  -- Snapshot final
  select * into v_snap from public._snapshot_inventario_mxn();

  update public.cierres_mensuales
     set estado = 'cerrado'::cierre_estado,
         fecha_cierre = now(),
         cerrado_por = v_uid,
         total_maquinas_periodo = v_total_maquinas,
         maquinas_pesadas = v_maquinas_pesadas,
         gramos_almacen_fin = v_snap.gramos_almacen,
         valor_almacen_fin = v_snap.valor_almacen,
         gramos_maquinas_fin = v_snap.gramos_maquinas,
         valor_maquinas_fin = v_snap.valor_maquinas,
         valor_vasos_almacen_fin = v_snap.valor_vasos_almacen,
         valor_vasos_maquinas_fin = v_snap.valor_vasos_maquinas
   where id = p_cierre_id;

  return p_cierre_id;
end;
$$;
grant execute on function public.cerrar_cierre_mensual(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Vista: los totales de inventario incluyen vasos; el consumo sigue en polvo
-- ----------------------------------------------------------------------------

create or replace view public.vista_reporte_cierre as
with movs as (
  select
    c.id as cierre_id,
    sum(case when mi.tipo = 'llenado_entrada_tolva' then mi.gramos else 0 end) as gramos_enviados_maq,
    sum(case when mi.tipo = 'llenado_entrada_tolva' then mi.valor_movimiento else 0 end) as valor_enviado_maq,
    sum(case when mi.tipo = 'devolucion_entrada_cartucho' then mi.gramos else 0 end) as gramos_devueltos,
    sum(case when mi.tipo = 'devolucion_entrada_cartucho' then mi.valor_movimiento else 0 end) as valor_devuelto,
    sum(case when mi.tipo in ('merma_ruta','merma_encartuchado') then mi.gramos else 0 end) as gramos_merma,
    sum(case when mi.tipo in ('merma_ruta','merma_encartuchado') then mi.valor_movimiento else 0 end) as valor_merma,
    sum(case when mi.tipo = 'ajuste_conteo_maquina' then mi.gramos else 0 end) as gramos_ajuste_pesaje,
    sum(case when mi.tipo = 'ajuste_conteo_maquina' then mi.valor_movimiento else 0 end) as valor_ajuste_pesaje,
    sum(case when mi.tipo = 'ajuste_conteo_almacen' then mi.gramos else 0 end) as gramos_ajuste_almacen,
    sum(case when mi.tipo = 'ajuste_conteo_almacen' then mi.valor_movimiento else 0 end) as valor_ajuste_almacen,
    sum(case when mi.tipo = 'venta_salida_tolva' then mi.gramos else 0 end) as gramos_venta,
    sum(case when mi.tipo = 'venta_salida_tolva' then mi.valor_movimiento else 0 end) as valor_venta,
    sum(case when mi.tipo = 'venta_salida_tolva' then 1 else 0 end) as num_ventas
  from public.cierres_mensuales c
  left join public.movimientos_inventario mi
    on extract(month from mi.fecha)::int = c.periodo_mes
   and extract(year from mi.fecha)::int = c.periodo_anio
  group by c.id
)
select
  c.id as cierre_id,
  c.periodo_mes,
  c.periodo_anio,
  c.estado,
  c.fecha_inicio_cierre,
  c.fecha_cierre,
  -- Inventario inicio (valor incluye vasos; gramos son solo polvo)
  c.gramos_almacen_inicio,
  (coalesce(c.valor_almacen_inicio,0) + coalesce(c.valor_vasos_almacen_inicio,0))::numeric(14,2) as valor_almacen_inicio,
  c.gramos_maquinas_inicio,
  (coalesce(c.valor_maquinas_inicio,0) + coalesce(c.valor_vasos_maquinas_inicio,0))::numeric(14,2) as valor_maquinas_inicio,
  (coalesce(c.valor_almacen_inicio,0) + coalesce(c.valor_vasos_almacen_inicio,0)
   + coalesce(c.valor_maquinas_inicio,0) + coalesce(c.valor_vasos_maquinas_inicio,0))::numeric(14,2) as valor_total_inicio,
  -- Inventario fin (valor incluye vasos; gramos son solo polvo)
  c.gramos_almacen_fin,
  (coalesce(c.valor_almacen_fin,0) + coalesce(c.valor_vasos_almacen_fin,0))::numeric(14,2) as valor_almacen_fin,
  c.gramos_maquinas_fin,
  (coalesce(c.valor_maquinas_fin,0) + coalesce(c.valor_vasos_maquinas_fin,0))::numeric(14,2) as valor_maquinas_fin,
  (coalesce(c.valor_almacen_fin,0) + coalesce(c.valor_vasos_almacen_fin,0)
   + coalesce(c.valor_maquinas_fin,0) + coalesce(c.valor_vasos_maquinas_fin,0))::numeric(14,2) as valor_total_fin,
  -- Desglose de vasos (por si se quiere mostrar aparte)
  coalesce(c.valor_vasos_almacen_inicio,0)::numeric(14,2) as valor_vasos_almacen_inicio,
  coalesce(c.valor_vasos_maquinas_inicio,0)::numeric(14,2) as valor_vasos_maquinas_inicio,
  coalesce(c.valor_vasos_almacen_fin,0)::numeric(14,2) as valor_vasos_almacen_fin,
  coalesce(c.valor_vasos_maquinas_fin,0)::numeric(14,2) as valor_vasos_maquinas_fin,
  -- Movimientos del periodo
  coalesce(abs(m.gramos_enviados_maq),0)::bigint as gramos_enviados_maquinas,
  coalesce(abs(m.valor_enviado_maq),0)::numeric(14,2) as valor_enviado_maquinas,
  coalesce(m.gramos_devueltos,0)::bigint as gramos_devueltos,
  coalesce(m.valor_devuelto,0)::numeric(14,2) as valor_devuelto,
  coalesce(abs(m.gramos_merma),0)::bigint as gramos_merma,
  coalesce(abs(m.valor_merma),0)::numeric(14,2) as valor_merma,
  coalesce(m.gramos_ajuste_pesaje,0)::bigint as gramos_ajuste_pesaje,
  coalesce(m.valor_ajuste_pesaje,0)::numeric(14,2) as valor_ajuste_pesaje,
  coalesce(m.gramos_ajuste_almacen,0)::bigint as gramos_ajuste_almacen,
  coalesce(m.valor_ajuste_almacen,0)::numeric(14,2) as valor_ajuste_almacen,
  coalesce(abs(m.gramos_venta),0)::bigint as gramos_venta_nayax,
  coalesce(abs(m.valor_venta),0)::numeric(14,2) as valor_venta_nayax,
  coalesce(m.num_ventas,0)::int as num_ventas_nayax,
  -- Consumo real calculado en máquinas (SOLO POLVO, sin vasos):
  -- Consumo = inv inicial máq polvo + enviado a máq - inv final máq polvo
  (
    coalesce(c.gramos_maquinas_inicio,0)
    + coalesce(abs(m.gramos_enviados_maq),0)
    - coalesce(c.gramos_maquinas_fin,0)
  )::bigint as gramos_consumo_calculado,
  (
    coalesce(c.valor_maquinas_inicio,0)
    + coalesce(abs(m.valor_enviado_maq),0)
    - coalesce(c.valor_maquinas_fin,0)
  )::numeric(14,2) as valor_consumo_calculado
from public.cierres_mensuales c
left join movs m on m.cierre_id = c.id;

grant select on public.vista_reporte_cierre to authenticated;
