-- ============================================================================
-- 102 · Ruteo dinámico: score de prioridad por máquina + origen de sugerencia
--
-- Diseño aprobado por dirección (handoff 14-ago-2026):
--   - El sistema PROPONE (score por máquina), Mariana DISPONE (edita y
--     confirma). Cada operador visita 10-11 máquinas/día de SU zona
--     (ruta_maquinas actual); lo dinámico es cuáles.
--   - Señales, en orden de prioridad:
--       1. REVISIÓN: sin vender >= 12 h dentro de horario de operación
--          (misma señal que salud de máquinas). Excluye máquinas tipo
--          'servicio' (Smart Energy: sin ventas Nayax por diseño).
--       2. CRÍTICA / 3. ALTA / 5. MEDIA / 6. BAJA: criticidad de resurtido
--          con la metodología validada del skill foto-inventario-maquinas
--          (criterios de Ángel, 11-jul-2026).
--       4. VISITA VENCIDA: días desde ultima_visita_at > frecuencia_visita_dias.
--       7. RELLENO: el resto, ordenado por proximidad a necesitar visita.
-- ============================================================================

-- 1) Permitir el origen 'sugerencia_dinamica' en asignacion_maquinas.
--    (KPI: medir desabasto y visitas-en-vano dinámico vs estático.)
alter table public.asignacion_maquinas
  drop constraint if exists asignacion_maquinas_origen_check;
alter table public.asignacion_maquinas
  add constraint asignacion_maquinas_origen_check
  check (origen = any (array['base_ruta'::text, 'agregada_excepcion'::text, 'sugerencia_dinamica'::text]));

-- 2) RPC del score
create or replace function public.sugerencia_ruteo_diaria()
returns table (
  maquina_id uuid,
  serie text,
  alias text,
  tipo text,
  cliente text,
  ubicacion text,
  lat double precision,
  lng double precision,
  ruta_id uuid,
  ruta_nombre text,
  ruta_color text,
  operador_id uuid,
  operador_nombre text,
  criticidad text,          -- critica | alta | media | baja | ok
  tolvas_cortas int,
  dias_min_vaciado numeric,  -- días para vaciarse de la tolva más apretada
  hueco_max_cartuchos int,   -- cartuchos que caben en la tolva más vaciada
  horas_sin_venta numeric,   -- en horario de operación (null en tipo servicio)
  abierta_ahora boolean,
  revision boolean,          -- señal máquina muda (>= 12 h sin venta operando)
  dias_sin_visita numeric,
  frecuencia_dias int,
  visita_vencida boolean,
  prioridad int,             -- 1 revisión · 2 crítica · 3 alta · 4 vencida · 5 media · 6 baja · 7 relleno
  motivo text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (user_has_role('admin'::app_role)
       or user_has_role('direccion'::app_role)
       or user_has_role('planeador'::app_role)) then
    raise exception 'Solo admin, dirección o planeación pueden consultar el ruteo.';
  end if;

  return query
  with consumo as (
    -- consumo diario por tolva, últimos 14 días, desde el kardex
    -- (ABS por el bug de signo en venta_salida_tolva)
    select mi.tolva_id, sum(abs(mi.gramos)) / 14.0 as g_dia
      from public.movimientos_inventario mi
     where mi.tipo = 'venta_salida_tolva'
       and mi.fecha >= now() - interval '14 days'
     group by mi.tolva_id
  ),
  tolva_stats as (
    select t.maquina_id,
      count(*) filter (
        where (t.capacidad_max_g - t.inventario_actual_g)
              >= coalesce(p.gramaje_cartucho_default, 400)
      ) as cortas,
      min(case when coalesce(c.g_dia, 0) > 0
               then t.inventario_actual_g / c.g_dia end) as dias_min,
      max(floor((t.capacidad_max_g - t.inventario_actual_g)::numeric
                / coalesce(p.gramaje_cartucho_default, 400)))::int as hueco_max,
      bool_or(t.inventario_actual_g < 3 * coalesce(t.gramaje_servicio, 30)) as alguna_casi_vacia
    from public.tolvas t
    join public.productos p on p.id = t.producto_id
    where t.producto_id is not null
    group by t.maquina_id
  ),
  ult_venta as (
    select vm.maquina_id, max(vm.fecha_transaccion) as ult
      from public.ventas_maquina vm
     group by vm.maquina_id
  ),
  base as (
    select m.id, m.serie, m.alias, m.tipo,
      cl.nombre as cliente, u.nombre as ubicacion,
      u.lat::double precision as lat, u.lng::double precision as lng,
      rt.ruta_id, rt.ruta_nombre, rt.color_hex as ruta_color,
      rt.operador_titular_id as operador_id, op.full_name as operador_nombre,
      ts.cortas, ts.dias_min, ts.hueco_max, ts.alguna_casi_vacia,
      case when m.tipo <> 'servicio' then
        public.horas_operativas_entre(
          coalesce(uv.ult, m.created_at), now(),
          coalesce(u.horario_apertura, '06:00'::time),
          coalesce(u.horario_cierre, '23:00'::time))
      end as horas_sv,
      case
        when coalesce(u.horario_cierre,'23:00'::time) > coalesce(u.horario_apertura,'06:00'::time)
          then (now() at time zone 'America/Mexico_City')::time >= coalesce(u.horario_apertura,'06:00'::time)
           and (now() at time zone 'America/Mexico_City')::time <  coalesce(u.horario_cierre,'23:00'::time)
        else (now() at time zone 'America/Mexico_City')::time >= coalesce(u.horario_apertura,'06:00'::time)
      end as abierta,
      case when m.ultima_visita_at is not null
           then round(extract(epoch from (now() - m.ultima_visita_at)) / 86400.0, 1)
      end as dias_visita,
      coalesce(m.frecuencia_visita_dias, 7) as frecuencia
    from public.maquinas m
    left join public.ubicaciones u on u.id = m.ubicacion_id
    left join public.clientes cl on cl.id = u.cliente_id
    left join tolva_stats ts on ts.maquina_id = m.id
    left join ult_venta uv on uv.maquina_id = m.id
    left join lateral (
      select rm.ruta_id, r.nombre as ruta_nombre, r.color_hex, r.operador_titular_id
        from public.ruta_maquinas rm
        join public.rutas r on r.id = rm.ruta_id
       where rm.maquina_id = m.id and r.activa
       order by rm.orden nulls last
       limit 1
    ) rt on true
    left join public.profiles op on op.id = rt.operador_titular_id
    where m.activo and m.estado = 'operativa'
  ),
  scored as (
    select b.*,
      (b.horas_sv is not null and b.abierta and b.horas_sv >= 12) as es_revision,
      case
        when coalesce(b.dias_min, 999) <= 3 or coalesce(b.hueco_max, 0) >= 3
             or coalesce(b.alguna_casi_vacia, false) then 'critica'
        when coalesce(b.dias_min, 999) < 5 or coalesce(b.cortas, 0) >= 4
             or coalesce(b.hueco_max, 0) >= 2 then 'alta'
        when coalesce(b.cortas, 0) between 2 and 3 then 'media'
        when coalesce(b.cortas, 0) = 1 then 'baja'
        else 'ok'
      end as crit,
      (b.dias_visita is null or b.dias_visita > b.frecuencia) as vencida
    from base b
  )
  select s.id, s.serie, s.alias, s.tipo, s.cliente, s.ubicacion, s.lat, s.lng,
    s.ruta_id, s.ruta_nombre, s.ruta_color, s.operador_id, s.operador_nombre,
    s.crit,
    coalesce(s.cortas, 0)::int,
    round(s.dias_min, 1),
    coalesce(s.hueco_max, 0)::int,
    round(s.horas_sv, 1),
    s.abierta,
    s.es_revision,
    s.dias_visita,
    s.frecuencia,
    s.vencida,
    case
      when s.es_revision then 1
      when s.crit = 'critica' then 2
      when s.crit = 'alta' then 3
      when s.vencida then 4
      when s.crit = 'media' then 5
      when s.crit = 'baja' then 6
      else 7
    end,
    trim(both ' · ' from concat_ws(' · ',
      case when s.es_revision
           then round(s.horas_sv, 0)::text || 'h sin venta — revisión' end,
      case when s.crit in ('critica','alta') and s.dias_min is not null
           then 'tolva a ' || round(s.dias_min, 1)::text || ' días' end,
      case when s.crit in ('critica','alta') and coalesce(s.hueco_max,0) >= 2
           then 'caben ' || s.hueco_max::text || ' cartuchos' end,
      case when s.crit in ('media','baja') and coalesce(s.cortas,0) > 0
           then s.cortas::text || ' tolva(s) corta(s)' end,
      case when s.vencida and s.dias_visita is not null
           then round(s.dias_visita, 0)::text || ' días sin visita (frec. '
                || s.frecuencia::text || ')' end,
      case when s.vencida and s.dias_visita is null
           then 'sin visita registrada' end
    ))
  from scored s
  order by
    case
      when s.es_revision then 1
      when s.crit = 'critica' then 2
      when s.crit = 'alta' then 3
      when s.vencida then 4
      when s.crit = 'media' then 5
      when s.crit = 'baja' then 6
      else 7
    end,
    s.dias_min asc nulls last,
    s.dias_visita desc nulls last;
end;
$$;

revoke all on function public.sugerencia_ruteo_diaria() from public;
grant execute on function public.sugerencia_ruteo_diaria() to authenticated;
