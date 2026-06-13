-- ============================================================================
-- 68 · Vista v_capital_trabajo: capital inmovilizado en inventario
--
-- Una fila con valor (MXN al costo promedio actual) y unidades, desglosado:
-- - Almacén: granel (lotes polvo) + cartuchos (encartuchados) + vasos (lotes)
-- - Máquinas: polvo en tolvas + vasos en máquina
-- ============================================================================

create or replace view public.v_capital_trabajo as
with alm_granel as (
  select coalesce(sum(l.gramos_disponibles_granel * l.costo_por_gramo), 0)::numeric(14,2) as valor,
         coalesce(sum(l.gramos_disponibles_granel), 0)::int as gramos
    from lotes l join productos p on p.id = l.producto_id
   where l.activo = true and p.tipo = 'polvo'
),
alm_cartuchos as (
  select coalesce(sum(e.cantidad_disponible * e.gramos_por_cartucho * e.costo_promedio_g), 0)::numeric(14,2) as valor,
         coalesce(sum(e.cantidad_disponible), 0)::int as cartuchos,
         coalesce(sum(e.cantidad_disponible * e.gramos_por_cartucho), 0)::int as gramos
    from encartuchados e
),
alm_vasos as (
  select coalesce(sum(l.unidades_disponibles * l.costo_por_gramo), 0)::numeric(14,2) as valor,
         coalesce(sum(l.unidades_disponibles), 0)::int as unidades
    from lotes l join productos p on p.id = l.producto_id
   where l.activo = true and p.tipo = 'vaso' and l.unidades_disponibles is not null
),
maq_polvo as (
  select coalesce(sum(t.inventario_actual_g * t.costo_promedio_g_actual), 0)::numeric(14,2) as valor,
         coalesce(sum(t.inventario_actual_g), 0)::int as gramos
    from tolvas t
),
vaso_costos as (
  select producto_id,
         sum(unidades_disponibles * costo_por_gramo) / nullif(sum(unidades_disponibles), 0) as costo_unit
    from lotes
   where activo = true and unidades_disponibles is not null
   group by producto_id
),
maq_vasos as (
  select coalesce(sum(m.vaso_inventario_actual * vc.costo_unit), 0)::numeric(14,2) as valor,
         coalesce(sum(m.vaso_inventario_actual), 0)::int as unidades
    from maquinas m
    left join vaso_costos vc on vc.producto_id = m.vaso_producto_id
   where m.vaso_producto_id is not null
)
select
  ag.valor      as alm_granel_valor,
  ag.gramos     as alm_granel_gramos,
  ac.valor      as alm_cartuchos_valor,
  ac.cartuchos  as alm_cartuchos_unidades,
  ac.gramos     as alm_cartuchos_gramos,
  av.valor      as alm_vasos_valor,
  av.unidades   as alm_vasos_unidades,
  mp.valor      as maq_polvo_valor,
  mp.gramos     as maq_polvo_gramos,
  mv.valor      as maq_vasos_valor,
  mv.unidades   as maq_vasos_unidades,
  (ag.valor + ac.valor + av.valor)::numeric(14,2) as almacen_total,
  (mp.valor + mv.valor)::numeric(14,2)            as maquinas_total,
  (ag.valor + ac.valor + av.valor + mp.valor + mv.valor)::numeric(14,2) as capital_total
from alm_granel ag, alm_cartuchos ac, alm_vasos av, maq_polvo mp, maq_vasos mv;

grant select on public.v_capital_trabajo to authenticated;
