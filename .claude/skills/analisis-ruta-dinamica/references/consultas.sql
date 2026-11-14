-- ===========================================================================
-- Consultas del análisis de ruta dinámica · proyecto opncevovlgcblwlztqck
--
-- Todas son de solo lectura. Sustituye las fechas de :desde y :hasta por el
-- rango que estés analizando, y las dos ventanas de comparación por los mismos
-- días de la semana de las dos semanas previas.
--
-- Nota de esquema, porque los nombres no son los obvios y cuesta tiempo
-- descubrirlo: la asignación del día es `asignaciones_diarias` (no
-- `asignaciones`); sus máquinas son `asignacion_maquinas`; el operador vive en
-- `profiles.full_name`; la máquina se identifica por `maquinas.alias` (no
-- `nombre` ni `codigo`); el pesaje es `pesajes_maquina` + `pesaje_tolva_items`;
-- el log de Nayax es `nayax_sync_log` en singular.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1 · CUMPLIMIENTO: planeado contra hecho
-- ---------------------------------------------------------------------------
select a.fecha, p.full_name as operador, a.estado::text,
       coalesce(r.nombre, '(sin ruta)') as etiqueta,
       count(distinct am.maquina_id) filter (where mm.tipo <> 'servicio') as plan_vending,
       count(distinct am.maquina_id) filter (where mm.tipo =  'servicio') as plan_energy,
       (select count(*) from check_ins ci where ci.asignacion_id = a.id) as visitas,
       a.notas, a.motivo_cierre_incompleto
from asignaciones_diarias a
left join rutas r on r.id = a.ruta_id
left join profiles p on p.id = a.operador_id
left join asignacion_maquinas am on am.asignacion_id = a.id
left join maquinas mm on mm.id = am.maquina_id
where a.fecha between :desde and :hasta
  and a.estado <> 'cancelada'
group by a.fecha, p.full_name, a.estado, r.nombre, a.notas, a.motivo_cierre_incompleto, a.id
order by a.fecha, p.full_name;


-- Detalle parada por parada: el orden que propuso el agente contra la hora real
-- de llegada. Aquí se ve si el operador respetó la secuencia o la invirtió.
select p.full_name as operador, coalesce(r.nombre,'(manual)') as etiqueta,
       am.orden, m.alias,
       case when ci.id is null then 'NO FUE'
            else to_char(ci.fecha_entrada at time zone 'America/Mexico_City','HH24:MI') end as hora,
       coalesce(am.origen,'manual') as origen, am.justificacion
from asignaciones_diarias a
join asignacion_maquinas am on am.asignacion_id = a.id
join maquinas m on m.id = am.maquina_id
left join rutas r on r.id = a.ruta_id
left join profiles p on p.id = a.operador_id
left join check_ins ci on ci.asignacion_id = a.id and ci.maquina_id = am.maquina_id
where a.fecha between :desde and :hasta and a.estado <> 'cancelada'
order by a.fecha, p.full_name, am.orden;


-- ---------------------------------------------------------------------------
-- 2 · PRODUCTIVIDAD POR OPERADOR
--
-- Los km salen de la secuencia REAL de visita (haversine sobre las coordenadas
-- de la ubicación), no de los que traía el plan. No incluyen los tramos
-- desde/hacia el CEDIS, que no se registran: dilo al presentar la cifra.
-- ---------------------------------------------------------------------------
with v as (
  select a.fecha, p.full_name op, ci.fecha_entrada, ci.fecha_salida, u.lat, u.lng,
         row_number() over (partition by a.fecha, p.full_name order by ci.fecha_entrada) n
  from check_ins ci
  join asignaciones_diarias a on a.id = ci.asignacion_id
  join maquinas m on m.id = ci.maquina_id
  join ubicaciones u on u.id = m.ubicacion_id
  left join profiles p on p.id = a.operador_id
  where a.fecha between :desde and :hasta and a.estado <> 'cancelada'
), d as (
  select v.fecha, v.op, v.fecha_entrada, v.fecha_salida,
    case when lag(v.lat) over w is null then 0 else
      2*6371*asin(sqrt(power(sin(radians(v.lat - lag(v.lat) over w)/2),2)
        + cos(radians(lag(v.lat) over w))*cos(radians(v.lat))
        * power(sin(radians(v.lng - lag(v.lng) over w)/2),2))) end as km
  from v window w as (partition by v.fecha, v.op order by v.n)
)
select fecha, op as operador, count(*) as visitas,
  to_char(min(fecha_entrada at time zone 'America/Mexico_City'),'HH24:MI') as arranque,
  to_char(max(coalesce(fecha_salida, fecha_entrada) at time zone 'America/Mexico_City'),'HH24:MI') as cierre,
  round(extract(epoch from (max(coalesce(fecha_salida,fecha_entrada)) - min(fecha_entrada)))/3600, 2) as horas,
  round(sum(km)::numeric, 1) as km_entre_paradas,
  round(avg(extract(epoch from (fecha_salida - fecha_entrada))/60)) as min_prom_sitio
from d group by fecha, op order by fecha, op;


-- Tiempo en sitio por operador contra lo que tiene configurado el agente.
-- Útil para saber si el parámetro sigue vigente; la dispersión entre personas
-- suele ser mayor que el error del parámetro.
select p.full_name as operador, o.puesto, o.min_en_sitio_estimado as configurado,
       count(*) as visitas,
       round(avg(extract(epoch from (ci.fecha_salida-ci.fecha_entrada))/60),1) as real_prom,
       round(percentile_cont(0.5) within group (order by extract(epoch from (ci.fecha_salida-ci.fecha_entrada))/60)::numeric,1) as mediana,
       round(percentile_cont(0.9) within group (order by extract(epoch from (ci.fecha_salida-ci.fecha_entrada))/60)::numeric,1) as p90
from check_ins ci
join maquinas m on m.id = ci.maquina_id
left join profiles p on p.id = ci.operador_id
left join operadores_ruteo o on o.operador_id = ci.operador_id
where ci.fecha_salida is not null and m.tipo <> 'servicio'
  and (ci.fecha_entrada at time zone 'America/Mexico_City')::date between :desde and :hasta
  and extract(epoch from (ci.fecha_salida-ci.fecha_entrada))/60 between 1 and 180
group by 1,2,3 order by 1;


-- El "costo fijo" real por parada: el hueco entre salir de una máquina y
-- entrar a la siguiente, menos el traslado teórico. Es lo que el modelo cobra
-- como `ruteo_min_fijos_parada`. Varía mucho entre moto y camioneta.
with v as (
  select a.fecha, p.full_name op, ci.fecha_entrada, ci.fecha_salida, u.lat, u.lng,
         row_number() over (partition by a.fecha, p.full_name order by ci.fecha_entrada) n
  from check_ins ci
  join asignaciones_diarias a on a.id = ci.asignacion_id
  join maquinas m on m.id = ci.maquina_id
  join ubicaciones u on u.id = m.ubicacion_id
  left join profiles p on p.id = a.operador_id
  where ci.fecha_salida is not null and m.tipo <> 'servicio'
    and (ci.fecha_entrada at time zone 'America/Mexico_City')::date between :desde and :hasta
), g as (
  select op,
    extract(epoch from (fecha_entrada - lag(fecha_salida) over w))/60 hueco,
    2*6371*asin(sqrt(power(sin(radians(lat - lag(lat) over w)/2),2)
      + cos(radians(lag(lat) over w))*cos(radians(lat))
      * power(sin(radians(lng - lag(lng) over w)/2),2))) km
  from v window w as (partition by fecha, op order by n)
)
select op as operador, count(*) tramos,
  round(avg(hueco)::numeric,1) as hueco_real_min,
  round(avg(km)::numeric,1) as km_prom,
  round(avg(km/21.0*60)::numeric,1) as traslado_a_21kmh,
  round(avg(hueco - km/21.0*60)::numeric,1) as fijo_implicito
from g where hueco between 0 and 240 group by op order by op;


-- ---------------------------------------------------------------------------
-- 3 · PRODUCTIVIDAD DEL PLANEADOR
-- ---------------------------------------------------------------------------
select pr.fecha, pr.estado::text, pr.fuente,
       to_char(pr.created_at  at time zone 'America/Mexico_City','HH24:MI') as agente_entrega,
       to_char(pr.decidida_at at time zone 'America/Mexico_City','HH24:MI') as decide,
       round(extract(epoch from (pr.decidida_at - pr.created_at))/60) as min_en_decidir,
       jsonb_array_length(pr.plan) as rutas,
       (select sum(jsonb_array_length(r->'paradas')) from jsonb_array_elements(pr.plan) r) as paradas,
       pr.costo_usd, round(pr.duracion_ms/1000.0) as seg_agente, pr.motivo_descarte
from propuestas_ruteo pr
where pr.fecha between :desde and :hasta
order by pr.fecha, pr.created_at;


-- Surtidos: cuánto tardó cada uno y a qué hora quedó listo. El dato que
-- importa es el hueco contra el primer check-in del día (consulta 2).
select (s.fecha at time zone 'America/Mexico_City')::date as dia, s.folio,
       p.full_name as surtio,
       to_char(s.fecha at time zone 'America/Mexico_City','HH24:MI') as inicio,
       to_char(s.fecha_completado at time zone 'America/Mexico_City','HH24:MI') as fin,
       round(extract(epoch from (s.fecha_completado - s.fecha))/60) as minutos,
       (select count(*) from surtido_items si where si.surtido_id = s.id) as renglones,
       (select coalesce(sum(si.cartuchos_entregados),0) from surtido_items si where si.surtido_id = s.id) as cartuchos,
       (select coalesce(sum(si.vasos_entregados),0) from surtido_items si where si.surtido_id = s.id) as vasos,
       pa.full_name as para_operador
from surtidos s
left join profiles p on p.id = s.surtido_por
left join asignaciones_diarias a on a.id = s.asignacion_id
left join profiles pa on pa.id = a.operador_id
where (s.fecha at time zone 'America/Mexico_City')::date between :desde and :hasta
order by s.fecha;


-- ---------------------------------------------------------------------------
-- 4 · AGUA
-- ---------------------------------------------------------------------------
-- Mediciones y cargas por operador y día, separando el litro del almacén del
-- comprado en tienda. `compra_operador` sale mucho más caro que `almacen`.
select (ae.fecha at time zone 'America/Mexico_City')::date as dia,
       p.full_name as operador, ae.tipo::text, coalesce(ae.origen::text,'—') as origen,
       count(*) as eventos,
       sum(coalesce(ae.garrafones,0)) as garrafones,
       round(sum(coalesce(ae.ml_cargados,0))/1000.0, 0) as litros
from agua_maquina_eventos ae
left join profiles p on p.id = ae.operador_id
where (ae.fecha at time zone 'America/Mexico_City')::date between :desde and :hasta
group by 1,2,3,4 order by 1,2,3;


-- Máquinas que el agente marcó con agua baja y qué recibieron. Las que
-- aparecen varios días seguidos BAJANDO son las que terminan en tanque vacío.
select pr.fecha, m->>'alias' as maquina,
  round((m->>'agua_dias')::numeric,1) as dias_de_agua,
  (select coalesce(sum(ae.ml_cargados),0)/1000 from agua_maquina_eventos ae
    where ae.maquina_id = (m->>'id')::uuid
      and (ae.fecha at time zone 'America/Mexico_City')::date = pr.fecha) as litros_recibidos,
  (select count(*) from check_ins ci
    where ci.maquina_id = (m->>'id')::uuid
      and (ci.fecha_entrada at time zone 'America/Mexico_City')::date = pr.fecha) as la_visitaron
from propuestas_ruteo pr, jsonb_array_elements(pr.estado_entrada->'maquinas') m
where pr.fecha between :desde and :hasta
  and (m->>'agua_dias')::numeric <= 7
order by pr.fecha, dias_de_agua;


-- Estado del agua hoy: quién está por quedarse sin ella.
select m.alias, round(v.ml_estimado/1000.0,1) as litros_hoy,
       round(v.dias_para_vaciarse,1) as dias_restantes,
       v.ultima_medicion::date, round(v.ml_por_dia/1000.0,1) as consumo_l_dia,
       v.sin_medicion
from v_agua_maquina v join maquinas m on m.id = v.maquina_id
where m.activo and (v.dias_para_vaciarse <= 7 or v.sin_medicion)
order by v.dias_para_vaciarse nulls first;


-- ---------------------------------------------------------------------------
-- 5 · QUEJAS E INCIDENCIAS
-- ---------------------------------------------------------------------------
-- Cada queja con la columna que lo cambia todo: ¿la visitaron o no?
select (q.fecha_reporte at time zone 'America/Mexico_City')::date as dia,
       q.folio, m.alias, q.tipo::text, q.estado::text, q.monto_reclamado,
       coalesce((select min((ci.fecha_entrada at time zone 'America/Mexico_City')::date)::text
                   from check_ins ci where ci.maquina_id = m.id
                    and (ci.fecha_entrada at time zone 'America/Mexico_City')::date between :desde and :hasta),
                'no la visitaron') as visita_en_ventana
from quejas q join maquinas m on m.id = q.maquina_id
where (q.fecha_reporte at time zone 'America/Mexico_City')::date between :desde and :hasta
order by dia, q.folio;


-- Incidencias abiertas en el periodo.
select (i.fecha_apertura at time zone 'America/Mexico_City')::date as dia,
       i.folio, m.alias, i.tipo::text, i.severidad::text, i.estado::text, i.descripcion
from incidencias i join maquinas m on m.id = i.maquina_id
where (i.fecha_apertura at time zone 'America/Mexico_City')::date between :desde and :hasta
order by dia, i.folio;


-- Máquinas que delatan un componente descompuesto: `quejas_tecnicas_30d`
-- incluye las fallas de dispensado desde nov-2026. Con 3 o más, el agente las
-- escala al supervisor.
select m.alias, v.quejas_abiertas, v.quejas_tecnicas_30d, v.pagado_30d
from v_quejas_por_maquina v join maquinas m on m.id = v.maquina_id
where v.quejas_tecnicas_30d >= 2 order by v.quejas_tecnicas_30d desc, m.alias;


-- ---------------------------------------------------------------------------
-- 6 · VENTAS, MÁQUINAS SIN VENDER Y COBERTURA
-- ---------------------------------------------------------------------------
-- Venta diaria. Pide un rango amplio (3 semanas) para ver el ritmo semanal y
-- no confundir un pico con la norma.
select to_char(d,'Dy DD-Mon') as dia, n as bebidas, round(bruto,0) as bruto
from (
  select (v.fecha_transaccion at time zone 'America/Mexico_City')::date d,
         count(*) n, sum(v.precio_bruto) bruto
  from ventas_maquina v join maquinas m on m.id = v.maquina_id
  where m.tipo <> 'servicio'
    and v.fecha_transaccion >= :desde_amplio and v.fecha_transaccion < :hasta_amplio
  group by 1) x
order by d;


-- Las tres ventanas comparables, lado a lado. Sustituye por los mismos días de
-- la semana. Dos ventanas previas, no una.
select periodo, count(*) as visitas,
       count(distinct maquina_id) as maquinas_distintas,
       sum(cart) as cartuchos,
       round(sum(cart)::numeric / nullif(count(*),0), 2) as cartuchos_por_visita,
       sum(vas) as vasos,
       count(*) filter (where cart = 0 and vas = 0 and agua = 0) as visitas_sin_carga
from (
  select case when d between :desde      and :hasta      then 'analizado'
              when d between :prev1_desde and :prev1_hasta then 'previa 1'
              when d between :prev2_desde and :prev2_hasta then 'previa 2' end as periodo,
         ci.maquina_id,
         (select coalesce(sum(li.cartuchos_cargados),0) from llenados l
            join llenado_items li on li.llenado_id = l.id where l.check_in_id = ci.id) cart,
         (select coalesce(sum(l.vasos_cargados),0) from llenados l where l.check_in_id = ci.id) vas,
         (select coalesce(sum(ae.ml_cargados),0) from agua_maquina_eventos ae where ae.check_in_id = ci.id) agua
  from check_ins ci
  join maquinas m on m.id = ci.maquina_id
  cross join lateral (select (ci.fecha_entrada at time zone 'America/Mexico_City')::date d) t
  where m.tipo <> 'servicio'
    and (d between :desde and :hasta
      or d between :prev1_desde and :prev1_hasta
      or d between :prev2_desde and :prev2_hasta)
) x
where periodo is not null
group by periodo order by periodo;


-- Máquinas que no vendieron nada, día por día.
with act as (select id from maquinas where activo and tipo <> 'servicio'),
d as (select generate_series(:desde::date, :hasta::date, '1 day')::date dia)
select to_char(d.dia,'Dy DD-Mon') as dia,
       (select count(*) from act) as parque,
       (select count(distinct v.maquina_id) from ventas_maquina v
         where (v.fecha_transaccion at time zone 'America/Mexico_City')::date = d.dia
           and v.maquina_id in (select id from act)) as vendieron,
       (select count(*) from act) -
       (select count(distinct v.maquina_id) from ventas_maquina v
         where (v.fecha_transaccion at time zone 'America/Mexico_City')::date = d.dia
           and v.maquina_id in (select id from act)) as sin_vender
from d order by d.dia;


-- Las mudas de verdad: llevan días sin una sola venta. Distínguelas de las que
-- simplemente no vendieron un día.
select m.alias, m.serie,
       (select max((v.fecha_transaccion at time zone 'America/Mexico_City')::date)
          from ventas_maquina v where v.maquina_id = m.id) as ultima_venta,
       (m.ultima_visita_at at time zone 'America/Mexico_City')::date as ultima_visita
from maquinas m
where m.activo and m.tipo <> 'servicio'
  and exists (select 1 from ventas_maquina v where v.maquina_id = m.id)
  and not exists (select 1 from ventas_maquina v where v.maquina_id = m.id
                    and v.fecha_transaccion > now() - interval '48 hours')
order by ultima_venta;


-- Cobertura: a quién no pisó nadie en el periodo, y cuántas de ésas ya traen
-- visita vencida.
select count(*) filter (where true) as sin_visitar,
       count(*) filter (where vencida) as de_esas_vencidas
from (
  select (current_date - (m.ultima_visita_at at time zone 'America/Mexico_City')::date)
         > m.frecuencia_visita_dias as vencida
  from maquinas m
  where m.activo and m.tipo <> 'servicio'
    and not exists (select 1 from check_ins ci where ci.maquina_id = m.id
                     and (ci.fecha_entrada at time zone 'America/Mexico_City')::date
                         between :desde and :hasta)
) x;


-- ---------------------------------------------------------------------------
-- 7 · QUÉ VIO EL AGENTE (para cuando una máquina no subió y quieres saber por qué)
--
-- `estado_entrada` guarda el estado exacto con el que se generó la propuesta.
-- Antes de concluir que el agente ignoró una máquina, mira qué traía.
-- ---------------------------------------------------------------------------
select pr.fecha,
       m->>'quejas_abiertas'      as quejas_abiertas,
       m->>'quejas_tecnicas_30d'  as quejas_tec_30d,
       m->>'incidencias_abiertas' as incidencias,
       m->>'dias_para_vaciarse'   as dias_vaciarse,
       m->>'tolvas_cortas'        as tolvas_cortas,
       m->>'hueco_cartuchos'      as hueco,
       m->>'horas_sin_venta'      as hrs_sin_venta,
       m->>'dias_sin_visita'      as dias_sin_visita,
       m->>'visita_vencida'       as vencida,
       m->>'agua_dias'            as agua_dias,
       m->>'venta_diaria_mxn'     as venta_dia
from propuestas_ruteo pr, jsonb_array_elements(pr.estado_entrada->'maquinas') m
where pr.fecha between :desde and :hasta
  and m->>'alias' = :maquina
order by pr.fecha;


-- Cuántas máquinas competían en cada nivel de la escalera de prioridad. Sirve
-- para saber si una máquina quedó fuera por criterio o por falta de paradas.
select pr.fecha,
  count(*) as maquinas_en_estado,
  count(*) filter (where (m->>'dias_para_vaciarse')::numeric <= 3)  as n1_tolva_critica,
  count(*) filter (where (m->>'hueco_cartuchos')::int >= 2)          as n2_hueco,
  count(*) filter (where (m->>'horas_sin_venta')::numeric >= 12)     as n3_muda,
  count(*) filter (where (m->>'quejas_tecnicas_30d')::int >= 3)      as n4_fallando,
  count(*) filter (where (m->>'visita_vencida')::boolean)            as n5_vencida,
  -- El `max()` no es cosmético: sin él, Postgres se queja de que `pr.plan` no
  -- está en el GROUP BY aunque sea constante dentro de cada fecha.
  max((select sum(jsonb_array_length(r->'paradas'))
         from jsonb_array_elements(pr.plan) r)) as paradas_disponibles
from propuestas_ruteo pr, jsonb_array_elements(pr.estado_entrada->'maquinas') m
where pr.fecha between :desde and :hasta
group by pr.fecha order by pr.fecha;
