-- ============================================================================
-- 162 · El resultado del último pesaje, por máquina
--
-- La señal que distingue una máquina descalibrada de una sana. Una mal
-- calibrada no se queda sin producto —las tolvas que sirven de menos se vacían
-- MÁS despacio— así que nunca sube por inventario, y hasta la migración
-- 20261114150000 tampoco subía por quejas. No había forma de que entrara a una
-- ruta.
--
-- IMPORTANTE: esta vista existe pero **todavía no alimenta al agente de ruteo**,
-- por decisión de dirección el 14-nov-2026. La razón es que el umbral de
-- `alerta_generada` del pesaje está demasiado flojo para priorizar con él:
--
--   tolvas con alerta   5 a 8 → 29 máquinas
--                       3 a 4 → 30
--                       0 a 2 → 13
--
-- 46 de 72 máquinas traen 3 o más. Como criterio marcaría dos tercios del
-- parque. Y cortar por `desviacion_max_pct` tampoco sirve todavía: a 75% deja 9
-- máquinas, pero se le escapa Delta (57.8%) mientras incluye a Reforma 222, que
-- tiene las 8 tolvas en alerta con una máxima de apenas 37.2%.
--
-- Primero hay que revisar con qué tolerancia se genera la alerta en el pesaje.
-- Cuando ese número signifique algo, esta vista es por dónde entra al agente.
-- ============================================================================

create or replace view public.v_calibracion_maquina
with (security_invoker = true) as
with ultimo as (
  select distinct on (pm.maquina_id)
         pm.id, pm.maquina_id, pm.fecha
    from public.pesajes_maquina pm
   order by pm.maquina_id, pm.fecha desc
)
select u.maquina_id,
       u.fecha as ultimo_pesaje,
       (now()::date - u.fecha::date) as dias_desde_pesaje,
       count(*) as tolvas_pesadas,
       count(*) filter (where i.alerta_generada) as tolvas_con_alerta,
       round(max(abs(i.diferencia_porcentaje)), 1) as desviacion_max_pct
  from ultimo u
  join public.pesaje_tolva_items i on i.pesaje_id = u.id
 group by u.maquina_id, u.fecha;

comment on view public.v_calibracion_maquina is
  'Resultado del último pesaje de cada máquina: cuántas tolvas quedaron fuera de rango y cuál fue la mayor desviación. Creada para el agente de ruteo pero todavía sin conectar: el umbral de alerta del pesaje marca a 46 de 72 máquinas. Ver migración 20261114151000.';

grant select on public.v_calibracion_maquina to authenticated;
