-- ============================================================================
-- 90 · Reporte de ventas por máquina (salud de máquinas)
--
-- Reemplaza el Excel manual "Resumen de Ventas MULTI". Por cada máquina activa:
--   - servicios y monto de AYER (día natural anterior, CDMX; monto = precio con IVA)
--   - promedio de servicios/día del mes en curso (hasta ayer) y del mes pasado
--   - última venta (para detectar máquinas "muertas")
-- El semáforo BAJO/ARRIBA (ayer vs promedio) se calcula en la UI.
-- ============================================================================

create or replace function public.reporte_ventas_maquinas()
returns table(
  maquina_id uuid, serie text, alias text, ubicacion text, cliente text,
  servicios_ayer int, monto_ayer numeric,
  serv_mes_actual int, prom_dia_actual numeric,
  serv_mes_pasado int, prom_dia_pasado numeric,
  ultima_venta timestamptz, activa boolean
)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  with w as (select (now() at time zone 'America/Mexico_City')::date as hoy),
  lim as (
    select
      ((hoy - 1)::timestamp at time zone 'America/Mexico_City') as ayer_ini,
      (hoy::timestamp at time zone 'America/Mexico_City')       as ayer_fin,
      (date_trunc('month', hoy::timestamp)::timestamp at time zone 'America/Mexico_City') as mes_ini,
      (date_trunc('month', (hoy - interval '1 month'))::timestamp at time zone 'America/Mexico_City') as mespas_ini,
      (date_trunc('month', hoy::timestamp)::timestamp at time zone 'America/Mexico_City') as mespas_fin,
      greatest(1, extract(day from (hoy - 1))::int) as dias_actual,
      extract(day from (date_trunc('month', hoy::timestamp) - interval '1 day'))::int as dias_pasado
    from w
  ),
  agg as (
    select vm.maquina_id,
      count(*) filter (where vm.fecha_transaccion >= l.ayer_ini and vm.fecha_transaccion < l.ayer_fin) as s_ayer,
      coalesce(sum(vm.precio_bruto) filter (where vm.fecha_transaccion >= l.ayer_ini and vm.fecha_transaccion < l.ayer_fin),0) as m_ayer,
      count(*) filter (where vm.fecha_transaccion >= l.mes_ini and vm.fecha_transaccion < l.ayer_fin) as s_mes_act,
      count(*) filter (where vm.fecha_transaccion >= l.mespas_ini and vm.fecha_transaccion < l.mespas_fin) as s_mes_pas,
      max(vm.fecha_transaccion) as ult
    from public.ventas_maquina vm cross join lim l
    group by vm.maquina_id
  )
  select m.id, m.serie, m.alias, u.nombre, cl.nombre,
    coalesce(a.s_ayer,0)::int, coalesce(a.m_ayer,0)::numeric(14,2),
    coalesce(a.s_mes_act,0)::int, round(coalesce(a.s_mes_act,0)::numeric / l.dias_actual, 2),
    coalesce(a.s_mes_pas,0)::int, round(coalesce(a.s_mes_pas,0)::numeric / nullif(l.dias_pasado,0), 2),
    a.ult, (m.activo and m.estado <> 'baja')
  from public.maquinas m
  cross join lim l
  left join agg a on a.maquina_id = m.id
  left join public.ubicaciones u on u.id = m.ubicacion_id
  left join public.clientes cl on cl.id = u.cliente_id
  where m.activo and m.estado <> 'baja'
  order by coalesce(a.s_ayer,0) asc, m.alias;
$$;

grant execute on function public.reporte_ventas_maquinas() to authenticated;
revoke execute on function public.reporte_ventas_maquinas() from anon, public;
