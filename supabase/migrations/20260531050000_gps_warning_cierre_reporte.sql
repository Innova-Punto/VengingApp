-- ============================================================================
-- 45 · GPS solo warning + cierre requiere 100% pesaje + reporte financiero
--
-- 1. op_check_in: ya no bloquea por distancia. Solo guarda validado=true
--    si está dentro de 100m, validado=false si está fuera, y deja registro
--    para auditoría. GPS sigue siendo obligatorio.
-- 2. cerrar_cierre_mensual: por default exige que TODAS las máquinas
--    activas tengan al menos un pesaje en el cierre. Se mantiene p_force.
-- 3. cierres_mensuales: nuevas columnas para snapshots de inventario y
--    movimientos del periodo. Se calculan al abrir y cerrar el cierre.
-- 4. Vista vista_reporte_cierre con el reporte financiero.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. op_check_in: warning en vez de bloqueo
-- ----------------------------------------------------------------------------

create or replace function public.op_check_in(
  p_asignacion_id uuid,
  p_maquina_id uuid,
  p_metodo checkin_metodo default 'manual_supervisado'::checkin_metodo,
  p_lat numeric default null,
  p_lng numeric default null,
  p_precision_m numeric default null,
  p_foto_url text default null,
  p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_check_in_id uuid;
  v_operador_id uuid;
  v_uid uuid := auth.uid();
  v_ubic_lat numeric;
  v_ubic_lng numeric;
  v_dist numeric;
  v_validado boolean := true;
  v_notas_finales text := p_notas;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_lat is null or p_lng is null then
    raise exception 'GPS obligatorio: activa la ubicación del celular y vuelve a intentar.';
  end if;

  select operador_id into v_operador_id from public.asignaciones_diarias where id = p_asignacion_id;
  if v_operador_id is null then raise exception 'Asignación no encontrada'; end if;
  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para esta asignación';
  end if;

  select u.lat, u.lng into v_ubic_lat, v_ubic_lng
    from public.maquinas m
    join public.ubicaciones u on u.id = m.ubicacion_id
   where m.id = p_maquina_id;

  if v_ubic_lat is not null and v_ubic_lng is not null then
    v_dist := public.distancia_metros(p_lat, p_lng, v_ubic_lat, v_ubic_lng);
    if v_dist is not null and v_dist > 100 then
      v_validado := false;
      v_notas_finales := coalesce(v_notas_finales || ' · ', '')
        || format('⚠ Fuera de rango (%s m)', v_dist::int);
    end if;
  end if;

  select id into v_check_in_id from public.check_ins
   where asignacion_id = p_asignacion_id and maquina_id = p_maquina_id;
  if v_check_in_id is not null then return v_check_in_id; end if;

  insert into public.check_ins (
    asignacion_id, maquina_id, operador_id,
    metodo, lat, lng, precision_m, foto_evidencia_url, notas,
    validado
  ) values (
    p_asignacion_id, p_maquina_id, v_operador_id,
    p_metodo, p_lat, p_lng, p_precision_m, p_foto_url, v_notas_finales,
    v_validado
  ) returning id into v_check_in_id;

  return v_check_in_id;
end;
$$;
grant execute on function public.op_check_in(uuid, uuid, checkin_metodo, numeric, numeric, numeric, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Snapshots de inventario en cierres_mensuales
-- ----------------------------------------------------------------------------

alter table public.cierres_mensuales
  add column if not exists gramos_almacen_inicio bigint,
  add column if not exists gramos_almacen_fin bigint,
  add column if not exists gramos_maquinas_inicio bigint,
  add column if not exists gramos_maquinas_fin bigint,
  add column if not exists valor_almacen_inicio numeric(14,2),
  add column if not exists valor_almacen_fin numeric(14,2),
  add column if not exists valor_maquinas_inicio numeric(14,2),
  add column if not exists valor_maquinas_fin numeric(14,2);

-- Helper: snapshot del valor de inventario hoy
create or replace function public._snapshot_inventario_mxn()
returns table (
  gramos_almacen bigint,
  valor_almacen numeric(14,2),
  gramos_maquinas bigint,
  valor_maquinas numeric(14,2)
) language sql stable security definer set search_path = public, pg_temp as $$
  select
    coalesce((select sum(coalesce(l.gramos_disponibles_granel,0))::bigint
              + coalesce(sum(e.cantidad_disponible * e.gramos_por_cartucho)::bigint, 0)
              from public.lotes l
              full outer join public.encartuchados e on false), 0)
      as gramos_almacen,
    coalesce(
      (select sum(coalesce(l.gramos_disponibles_granel,0) * coalesce(l.costo_por_gramo,0))
         from public.lotes l where l.activo = true)
      + (select sum(e.cantidad_disponible * e.gramos_por_cartucho * coalesce(e.costo_promedio_g,0))
         from public.encartuchados e where e.cantidad_disponible > 0),
      0)::numeric(14,2) as valor_almacen,
    coalesce((select sum(inventario_actual_g)::bigint from public.tolvas where inventario_actual_g > 0), 0) as gramos_maquinas,
    coalesce(
      (select sum(inventario_actual_g * coalesce(costo_promedio_g_actual,0))
         from public.tolvas where inventario_actual_g > 0),
      0)::numeric(14,2) as valor_maquinas;
$$;
grant execute on function public._snapshot_inventario_mxn() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- abrir_cierre_mensual: guarda snapshot inicial
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
    gramos_maquinas_inicio, valor_maquinas_inicio
  ) values (
    p_mes, p_anio, 'abierto'::cierre_estado, now(),
    v_snap.gramos_almacen, v_snap.valor_almacen,
    v_snap.gramos_maquinas, v_snap.valor_maquinas
  ) returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.abrir_cierre_mensual(int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- cerrar_cierre_mensual: requiere 100% pesaje (con p_force) + snapshot final
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
         valor_maquinas_fin = v_snap.valor_maquinas
   where id = p_cierre_id;

  return p_cierre_id;
end;
$$;
grant execute on function public.cerrar_cierre_mensual(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Vista: reporte financiero del cierre
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
  -- Inventario inicio
  c.gramos_almacen_inicio,
  c.valor_almacen_inicio,
  c.gramos_maquinas_inicio,
  c.valor_maquinas_inicio,
  (coalesce(c.valor_almacen_inicio,0) + coalesce(c.valor_maquinas_inicio,0))::numeric(14,2) as valor_total_inicio,
  -- Inventario fin
  c.gramos_almacen_fin,
  c.valor_almacen_fin,
  c.gramos_maquinas_fin,
  c.valor_maquinas_fin,
  (coalesce(c.valor_almacen_fin,0) + coalesce(c.valor_maquinas_fin,0))::numeric(14,2) as valor_total_fin,
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
  -- Consumo real calculado en máquinas:
  -- Consumo = inv inicial máq + enviado a máq - inv final máq
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
