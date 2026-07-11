-- ============================================================================
-- 91 · Alerta proactiva: máquina sin vender ≥12 h en horario de operación
--
-- Objetivo: que planeación reciba/vea las máquinas "muertas" para enviar a un
-- operador a revisarlas. Solo cuenta HORAS DE OPERACIÓN del gym (default
-- 06:00–23:00 cuando la ubicación no tenga horario), para evitar falsas alarmas
-- de madrugada.
--
-- Piezas:
--   1) horas_operativas_entre(t1,t2,ap,ci): horas dentro del horario entre dos
--      instantes (CDMX). Normaliza cierre <= apertura como fin de día.
--   2) reporte_ventas_maquinas(): se le agregan horas_op_sin_venta y abierta_ahora.
--   3) detectar_maquinas_sin_venta(umbral): crea alertas 'maquina_sin_venta_12h'
--      para máquinas sin venta ≥ umbral en horario (sin alerta activa) y descarta
--      en automático las que ya volvieron a vender. Idempotente.
--   4) pg_cron: corre el detector cada hora.
--
-- El tipo de alerta 'maquina_sin_venta_12h' se agrega en su propia migración
-- (20260708180000) porque ADD VALUE no puede usarse en la misma transacción.
-- ============================================================================

-- 1) Horas dentro del horario de operación entre dos instantes (CDMX)
create or replace function public.horas_operativas_entre(t1 timestamptz, t2 timestamptz, ap time, ci time)
returns numeric language plpgsql immutable set search_path to 'public','pg_temp' as $$
declare
  l1 timestamp := t1 at time zone 'America/Mexico_City';
  l2 timestamp := t2 at time zone 'America/Mexico_City';
  v_ap time := coalesce(ap, '06:00');
  v_ci time := coalesce(ci, '23:00');
  d date; seg_ini timestamp; seg_fin timestamp; total numeric := 0;
begin
  if l2 <= l1 then return 0; end if;
  if v_ci <= v_ap then v_ci := '23:59:59'; end if;
  for d in select generate_series(l1::date, l2::date, interval '1 day')::date loop
    seg_ini := greatest(l1, d + v_ap);
    seg_fin := least(l2, d + v_ci);
    if seg_fin > seg_ini then
      total := total + extract(epoch from (seg_fin - seg_ini))/3600.0;
    end if;
  end loop;
  return round(total, 2);
end $$;

-- 2) Reporte con horas sin venta (operación) y si la máquina está abierta ahora
drop function if exists public.reporte_ventas_maquinas();
create function public.reporte_ventas_maquinas()
returns table(
  maquina_id uuid, serie text, alias text, ubicacion text, cliente text,
  servicios_ayer int, monto_ayer numeric,
  serv_mes_actual int, prom_dia_actual numeric,
  serv_mes_pasado int, prom_dia_pasado numeric,
  ultima_venta timestamptz, activa boolean,
  horas_op_sin_venta numeric, abierta_ahora boolean
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
      extract(day from (date_trunc('month', hoy::timestamp) - interval '1 day'))::int as dias_pasado,
      now() as ahora,
      (now() at time zone 'America/Mexico_City')::time as lt
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
    a.ult, (m.activo and m.estado <> 'baja'),
    public.horas_operativas_entre(coalesce(a.ult, m.created_at), l.ahora,
        coalesce(u.horario_apertura,'06:00'::time), coalesce(u.horario_cierre,'23:00'::time)),
    case
      when coalesce(u.horario_cierre,'23:00'::time) > coalesce(u.horario_apertura,'06:00'::time)
        then l.lt >= coalesce(u.horario_apertura,'06:00'::time) and l.lt < coalesce(u.horario_cierre,'23:00'::time)
      else l.lt >= coalesce(u.horario_apertura,'06:00'::time)
    end
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

-- 3) Detector de alertas (crea nuevas, descarta las recuperadas). Idempotente.
create or replace function public.detectar_maquinas_sin_venta(p_umbral numeric default 12)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_creadas int := 0; v_cerradas int := 0;
begin
  update public.alertas a
     set estado = 'descartada'::alerta_estado, fecha_cierre = now(),
         notas_resolucion = 'Auto: la máquina volvió a vender o quedó bajo umbral'
   where a.tipo = 'maquina_sin_venta_12h'::alerta_tipo and a.estado = 'activa'::alerta_estado
     and not exists (
       select 1 from public.reporte_ventas_maquinas() r
        where r.maquina_id = a.maquina_id and r.horas_op_sin_venta >= p_umbral and r.abierta_ahora
     );
  get diagnostics v_cerradas = row_count;

  with nuevas as (
    insert into public.alertas (tipo, severidad, maquina_id, mensaje, datos_jsonb)
    select 'maquina_sin_venta_12h'::alerta_tipo, 'warning'::alerta_severidad, r.maquina_id,
           'Máquina ' || coalesce(r.alias, 'serie '||r.serie)
             || coalesce(' ('||r.ubicacion||')','')
             || ' sin vender ' || round(r.horas_op_sin_venta)::int
             || ' h en horario de operación. Enviar operador a revisar.',
           jsonb_build_object('horas_sin_venta', r.horas_op_sin_venta,
                              'ultima_venta', r.ultima_venta, 'umbral', p_umbral)
    from public.reporte_ventas_maquinas() r
    where r.horas_op_sin_venta >= p_umbral and r.abierta_ahora
      and not exists (
        select 1 from public.alertas a
         where a.tipo = 'maquina_sin_venta_12h'::alerta_tipo and a.estado = 'activa'::alerta_estado
           and a.maquina_id = r.maquina_id)
    returning 1)
  select count(*) into v_creadas from nuevas;

  return jsonb_build_object('creadas', v_creadas, 'cerradas', v_cerradas, 'umbral', p_umbral, 'ejecutado_at', now());
end $$;
revoke execute on function public.detectar_maquinas_sin_venta(numeric) from anon, public;

-- 4) Cron: cada hora
select cron.schedule('detectar-maquinas-sin-venta', '0 * * * *',
  $$select public.detectar_maquinas_sin_venta(12);$$);
