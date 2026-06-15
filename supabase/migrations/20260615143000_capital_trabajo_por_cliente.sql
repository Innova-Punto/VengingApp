-- ============================================================================
-- 71 · Filtro de capital de trabajo por cliente
--
-- Productos asociados a un cliente: exclusivos + usados en sus máquinas
-- (tolvas + vasos). Función capital_trabajo(cliente_id) regresa los mismos
-- agregados que v_capital_trabajo pero opcionalmente filtrados.
-- ============================================================================

create or replace function public.productos_de_cliente(p_cliente_id uuid)
returns setof uuid
language sql stable as $$
  select id from public.productos
   where cliente_exclusivo_id = p_cliente_id
  union
  select distinct t.producto_id
    from public.tolvas t
    join public.maquinas m on m.id = t.maquina_id
    join public.ubicaciones u on u.id = m.ubicacion_id
   where u.cliente_id = p_cliente_id
     and t.producto_id is not null
  union
  select distinct m.vaso_producto_id
    from public.maquinas m
    join public.ubicaciones u on u.id = m.ubicacion_id
   where u.cliente_id = p_cliente_id
     and m.vaso_producto_id is not null;
$$;

grant execute on function public.productos_de_cliente(uuid) to authenticated;


create or replace function public.capital_trabajo(p_cliente_id uuid default null)
returns table (
  alm_granel_valor       numeric(14,2),
  alm_granel_gramos      int,
  alm_cartuchos_valor    numeric(14,2),
  alm_cartuchos_unidades int,
  alm_cartuchos_gramos   int,
  alm_vasos_valor        numeric(14,2),
  alm_vasos_unidades     int,
  maq_polvo_valor        numeric(14,2),
  maq_polvo_gramos       int,
  maq_vasos_valor        numeric(14,2),
  maq_vasos_unidades     int,
  almacen_total          numeric(14,2),
  maquinas_total         numeric(14,2),
  capital_total          numeric(14,2)
)
language sql stable as $$
  with prods as (
    select id from public.productos
     where p_cliente_id is null
        or id in (select * from public.productos_de_cliente(p_cliente_id))
  ),
  maqs as (
    select m.id, m.vaso_producto_id, m.vaso_inventario_actual
      from public.maquinas m
      left join public.ubicaciones u on u.id = m.ubicacion_id
     where p_cliente_id is null or u.cliente_id = p_cliente_id
  ),
  alm_granel as (
    select coalesce(sum(l.gramos_disponibles_granel * l.costo_por_gramo), 0)::numeric(14,2) as valor,
           coalesce(sum(l.gramos_disponibles_granel), 0)::int as gramos
      from public.lotes l
      join public.productos p on p.id = l.producto_id
     where l.activo = true and p.tipo = 'polvo'
       and p.id in (select id from prods)
  ),
  alm_cartuchos as (
    select coalesce(sum(e.cantidad_disponible * e.gramos_por_cartucho * e.costo_promedio_g), 0)::numeric(14,2) as valor,
           coalesce(sum(e.cantidad_disponible), 0)::int as cartuchos,
           coalesce(sum(e.cantidad_disponible * e.gramos_por_cartucho), 0)::int as gramos
      from public.encartuchados e
     where e.producto_id in (select id from prods)
  ),
  alm_vasos as (
    select coalesce(sum(l.unidades_disponibles * l.costo_por_gramo), 0)::numeric(14,2) as valor,
           coalesce(sum(l.unidades_disponibles), 0)::int as unidades
      from public.lotes l
      join public.productos p on p.id = l.producto_id
     where l.activo = true and p.tipo = 'vaso'
       and l.unidades_disponibles is not null
       and p.id in (select id from prods)
  ),
  maq_polvo as (
    select coalesce(sum(t.inventario_actual_g * t.costo_promedio_g_actual), 0)::numeric(14,2) as valor,
           coalesce(sum(t.inventario_actual_g), 0)::int as gramos
      from public.tolvas t
     where t.maquina_id in (select id from maqs)
  ),
  vaso_costos as (
    select producto_id,
           sum(unidades_disponibles * costo_por_gramo) / nullif(sum(unidades_disponibles), 0) as costo_unit
      from public.lotes
     where activo = true and unidades_disponibles is not null
     group by producto_id
  ),
  maq_vasos as (
    select coalesce(sum(m.vaso_inventario_actual * vc.costo_unit), 0)::numeric(14,2) as valor,
           coalesce(sum(m.vaso_inventario_actual), 0)::int as unidades
      from maqs m
      left join vaso_costos vc on vc.producto_id = m.vaso_producto_id
     where m.vaso_producto_id is not null
  )
  select
    ag.valor, ag.gramos,
    ac.valor, ac.cartuchos, ac.gramos,
    av.valor, av.unidades,
    mp.valor, mp.gramos,
    mv.valor, mv.unidades,
    (ag.valor + ac.valor + av.valor)::numeric(14,2),
    (mp.valor + mv.valor)::numeric(14,2),
    (ag.valor + ac.valor + av.valor + mp.valor + mv.valor)::numeric(14,2)
  from alm_granel ag, alm_cartuchos ac, alm_vasos av, maq_polvo mp, maq_vasos mv;
$$;

grant execute on function public.capital_trabajo(uuid) to authenticated;
