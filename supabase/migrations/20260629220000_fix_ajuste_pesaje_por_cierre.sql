-- ============================================================================
-- 77 · Fix: el ajuste por pesaje del reporte de cierre se atribuye por CIERRE
--
-- Bug: vista_reporte_cierre sumaba los movimientos 'ajuste_conteo_maquina'
-- por FECHA del movimiento (mes/año). Eso incluía pesajes de "captura inicial"
-- (tolva teórica en 0 → la diferencia fue el inventario completo) que tienen
-- cierre_id NULL pero cayeron en el mismo mes, inflando la línea "ajuste por
-- pesaje" (ej. junio: $118k reportado vs $3.1k real).
--
-- Fix: atribuir el ajuste por pesaje al cierre al que pertenece el pesaje
-- (pesajes_maquina.cierre_id), no por fecha. El resto de líneas se mantiene.
-- ============================================================================

-- Cambia el conjunto/orden de columnas: `create or replace view` no basta.
drop view if exists public.vista_reporte_cierre;
create view public.vista_reporte_cierre as
with movs as (
  select
    c.id as cierre_id,
    sum(case when mi.tipo = 'llenado_entrada_tolva' then mi.gramos else 0 end) as gramos_enviados_maq,
    sum(case when mi.tipo = 'llenado_entrada_tolva' then mi.valor_movimiento else 0 end) as valor_enviado_maq,
    sum(case when mi.tipo = 'devolucion_entrada_cartucho' then mi.gramos else 0 end) as gramos_devueltos,
    sum(case when mi.tipo = 'devolucion_entrada_cartucho' then mi.valor_movimiento else 0 end) as valor_devuelto,
    sum(case when mi.tipo in ('merma_ruta','merma_encartuchado') then mi.gramos else 0 end) as gramos_merma,
    sum(case when mi.tipo in ('merma_ruta','merma_encartuchado') then mi.valor_movimiento else 0 end) as valor_merma,
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
),
-- Ajuste por pesaje atribuido por el CIERRE del pesaje (no por fecha del mov).
pes as (
  select pm.cierre_id,
         sum(mi.gramos) as gramos_ajuste_pesaje,
         sum(mi.valor_movimiento) as valor_ajuste_pesaje
  from public.pesajes_maquina pm
  join public.movimientos_inventario mi
    on mi.referencia_id = pm.id
   and mi.tipo = 'ajuste_conteo_maquina'::movimiento_tipo
  where pm.cierre_id is not null
  group by pm.cierre_id
)
select
  c.id as cierre_id,
  c.periodo_mes,
  c.periodo_anio,
  c.estado,
  c.fecha_inicio_cierre,
  c.fecha_cierre,
  c.gramos_almacen_inicio,
  (coalesce(c.valor_almacen_inicio,0) + coalesce(c.valor_vasos_almacen_inicio,0))::numeric(14,2) as valor_almacen_inicio,
  c.gramos_maquinas_inicio,
  (coalesce(c.valor_maquinas_inicio,0) + coalesce(c.valor_vasos_maquinas_inicio,0))::numeric(14,2) as valor_maquinas_inicio,
  (coalesce(c.valor_almacen_inicio,0) + coalesce(c.valor_vasos_almacen_inicio,0)
   + coalesce(c.valor_maquinas_inicio,0) + coalesce(c.valor_vasos_maquinas_inicio,0))::numeric(14,2) as valor_total_inicio,
  c.gramos_almacen_fin,
  (coalesce(c.valor_almacen_fin,0) + coalesce(c.valor_vasos_almacen_fin,0))::numeric(14,2) as valor_almacen_fin,
  c.gramos_maquinas_fin,
  (coalesce(c.valor_maquinas_fin,0) + coalesce(c.valor_vasos_maquinas_fin,0))::numeric(14,2) as valor_maquinas_fin,
  (coalesce(c.valor_almacen_fin,0) + coalesce(c.valor_vasos_almacen_fin,0)
   + coalesce(c.valor_maquinas_fin,0) + coalesce(c.valor_vasos_maquinas_fin,0))::numeric(14,2) as valor_total_fin,
  coalesce(c.valor_vasos_almacen_inicio,0)::numeric(14,2) as valor_vasos_almacen_inicio,
  coalesce(c.valor_vasos_maquinas_inicio,0)::numeric(14,2) as valor_vasos_maquinas_inicio,
  coalesce(c.valor_vasos_almacen_fin,0)::numeric(14,2) as valor_vasos_almacen_fin,
  coalesce(c.valor_vasos_maquinas_fin,0)::numeric(14,2) as valor_vasos_maquinas_fin,
  coalesce(abs(m.gramos_enviados_maq),0)::bigint as gramos_enviados_maquinas,
  coalesce(abs(m.valor_enviado_maq),0)::numeric(14,2) as valor_enviado_maquinas,
  coalesce(m.gramos_devueltos,0)::bigint as gramos_devueltos,
  coalesce(m.valor_devuelto,0)::numeric(14,2) as valor_devuelto,
  coalesce(abs(m.gramos_merma),0)::bigint as gramos_merma,
  coalesce(abs(m.valor_merma),0)::numeric(14,2) as valor_merma,
  coalesce(p.gramos_ajuste_pesaje,0)::bigint as gramos_ajuste_pesaje,
  coalesce(p.valor_ajuste_pesaje,0)::numeric(14,2) as valor_ajuste_pesaje,
  coalesce(m.gramos_ajuste_almacen,0)::bigint as gramos_ajuste_almacen,
  coalesce(m.valor_ajuste_almacen,0)::numeric(14,2) as valor_ajuste_almacen,
  coalesce(abs(m.gramos_venta),0)::bigint as gramos_venta_nayax,
  coalesce(abs(m.valor_venta),0)::numeric(14,2) as valor_venta_nayax,
  coalesce(m.num_ventas,0)::int as num_ventas_nayax,
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
left join movs m on m.cierre_id = c.id
left join pes p on p.cierre_id = c.id;

grant select on public.vista_reporte_cierre to authenticated;
