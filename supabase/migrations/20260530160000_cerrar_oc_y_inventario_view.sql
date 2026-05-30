-- ============================================================================
-- 29 · Cierre de OC con faltantes + vista de inventario con mín/máx
-- ============================================================================

alter table public.ordenes_compra
  add column motivo_cierre text;

comment on column public.ordenes_compra.motivo_cierre is
  'Texto libre con la razón de cerrar una OC parcial sin recibir todo (ej. proveedor sin stock).';

alter table public.productos
  add column stock_minimo     int not null default 0 check (stock_minimo >= 0),
  add column stock_maximo     int not null default 0 check (stock_maximo >= 0),
  add column punto_reorden    int not null default 0 check (punto_reorden >= 0);

comment on column public.productos.stock_minimo is
  'Stock crítico: por debajo se considera emergencia. Polvos en gramos, vasos en unidades.';
comment on column public.productos.stock_maximo is
  'Stock objetivo: lo que se busca tener tras una compra.';
comment on column public.productos.punto_reorden is
  'Cuando el stock llega a este nivel, conviene levantar una OC nueva.';

create or replace view public.v_inventario_producto as
with granel as (
  select producto_id,
         coalesce(sum(gramos_disponibles_granel), 0) as gramos_granel
    from public.lotes
   where activo = true
   group by producto_id
),
cartuchos as (
  select producto_id,
         coalesce(sum(cantidad_disponible), 0) as cartuchos_disponibles,
         coalesce(sum(cantidad_disponible * gramos_por_cartucho), 0) as gramos_en_cartuchos
    from public.encartuchados
   group by producto_id
),
vasos as (
  select producto_id,
         coalesce(sum(unidades_disponibles), 0) as unidades_disponibles
    from public.lotes
   where activo = true and unidades_disponibles is not null
   group by producto_id
)
select
  p.id, p.sku, p.nombre, p.tipo, p.marca, p.sabor, p.activo,
  p.gramaje_cartucho_default,
  p.stock_minimo, p.stock_maximo, p.punto_reorden,
  coalesce(g.gramos_granel, 0)            as gramos_granel,
  coalesce(c.cartuchos_disponibles, 0)    as cartuchos_disponibles,
  coalesce(c.gramos_en_cartuchos, 0)      as gramos_en_cartuchos,
  coalesce(v.unidades_disponibles, 0)     as unidades_disponibles,
  case
    when p.tipo = 'polvo'
      then coalesce(g.gramos_granel, 0) + coalesce(c.gramos_en_cartuchos, 0)
    when p.tipo = 'vaso'
      then coalesce(v.unidades_disponibles, 0)
  end as stock_total,
  case
    when p.tipo = 'polvo'
      then coalesce(g.gramos_granel, 0) + coalesce(c.gramos_en_cartuchos, 0) < p.stock_minimo
    when p.tipo = 'vaso'
      then coalesce(v.unidades_disponibles, 0) < p.stock_minimo
  end as bajo_minimo,
  case
    when p.tipo = 'polvo'
      then coalesce(g.gramos_granel, 0) + coalesce(c.gramos_en_cartuchos, 0) <= p.punto_reorden
       and coalesce(g.gramos_granel, 0) + coalesce(c.gramos_en_cartuchos, 0) >= p.stock_minimo
    when p.tipo = 'vaso'
      then coalesce(v.unidades_disponibles, 0) <= p.punto_reorden
       and coalesce(v.unidades_disponibles, 0) >= p.stock_minimo
  end as en_punto_reorden
from public.productos p
left join granel g    on g.producto_id = p.id
left join cartuchos c on c.producto_id = p.id
left join vasos v     on v.producto_id = p.id;

grant select on public.v_inventario_producto to authenticated;
