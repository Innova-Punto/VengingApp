-- ============================================================================
-- 80 · Snapshot de inventario POR PRODUCTO en cada cierre (inicio/fin)
--
-- Permite desglosar inventario inicial/final y consumo por cliente y por SKU.
-- Como cada producto pertenece a un cliente (cliente_exclusivo_id), por-cliente
-- es simplemente la suma de los productos del cliente.
--
--   * snapshot_inventario_por_producto(): foto del inventario actual por producto
--     (almacén granel/cartuchos/vasos + máquinas polvo/vasos).
--   * cierre_snapshot_producto: guarda esa foto al abrir (inicio) y cerrar (fin).
--   * abrir_cierre_mensual: inicio = final por producto del cierre anterior
--     (encadenado) o foto en vivo (bootstrap).
--   * cerrar_cierre_mensual: guarda el final por producto.
-- ============================================================================

create or replace function public.snapshot_inventario_por_producto()
returns table (
  producto_id uuid,
  alm_granel_gramos bigint, alm_granel_valor numeric(14,2),
  alm_cartuchos_unidades int, alm_cartuchos_gramos bigint, alm_cartuchos_valor numeric(14,2),
  alm_vasos_unidades int, alm_vasos_valor numeric(14,2),
  maq_polvo_gramos bigint, maq_polvo_valor numeric(14,2),
  maq_vasos_unidades int, maq_vasos_valor numeric(14,2)
) language sql stable security definer set search_path=public,pg_temp as $fn$
  with
  ag as (
    select l.producto_id,
           sum(l.gramos_disponibles_granel)::bigint as g,
           sum(l.gramos_disponibles_granel * coalesce(l.costo_por_gramo,0))::numeric(14,2) as v
    from public.lotes l join public.productos p on p.id=l.producto_id
    where l.activo and p.tipo='polvo' group by l.producto_id
  ),
  ac as (
    select e.producto_id,
           sum(e.cantidad_disponible)::int as u,
           sum(e.cantidad_disponible*e.gramos_por_cartucho)::bigint as g,
           sum(e.cantidad_disponible*e.gramos_por_cartucho*coalesce(e.costo_promedio_g,0))::numeric(14,2) as v
    from public.encartuchados e where e.cantidad_disponible>0 group by e.producto_id
  ),
  av as (
    select l.producto_id,
           sum(l.unidades_disponibles)::int as u,
           sum(l.unidades_disponibles*coalesce(l.costo_por_gramo,0))::numeric(14,2) as v
    from public.lotes l join public.productos p on p.id=l.producto_id
    where l.activo and p.tipo='vaso' and l.unidades_disponibles is not null group by l.producto_id
  ),
  mp as (
    select t.producto_id,
           sum(t.inventario_actual_g)::bigint as g,
           sum(t.inventario_actual_g*coalesce(t.costo_promedio_g_actual,0))::numeric(14,2) as v
    from public.tolvas t where t.producto_id is not null and t.inventario_actual_g>0 group by t.producto_id
  ),
  vaso_costos as (
    select producto_id, sum(unidades_disponibles*costo_por_gramo)/nullif(sum(unidades_disponibles),0) as cu
    from public.lotes where activo and unidades_disponibles is not null group by producto_id
  ),
  mv as (
    select m.vaso_producto_id as producto_id,
           sum(m.vaso_inventario_actual)::int as u,
           sum(m.vaso_inventario_actual*coalesce(vc.cu,0))::numeric(14,2) as v
    from public.maquinas m left join vaso_costos vc on vc.producto_id=m.vaso_producto_id
    where m.vaso_producto_id is not null group by m.vaso_producto_id
  ),
  prods as (
    select producto_id from ag union select producto_id from ac union
    select producto_id from av union select producto_id from mp union select producto_id from mv
  )
  select p.producto_id,
    coalesce(ag.g,0)::bigint, coalesce(ag.v,0)::numeric(14,2),
    coalesce(ac.u,0)::int, coalesce(ac.g,0)::bigint, coalesce(ac.v,0)::numeric(14,2),
    coalesce(av.u,0)::int, coalesce(av.v,0)::numeric(14,2),
    coalesce(mp.g,0)::bigint, coalesce(mp.v,0)::numeric(14,2),
    coalesce(mv.u,0)::int, coalesce(mv.v,0)::numeric(14,2)
  from prods p
  left join ag on ag.producto_id=p.producto_id
  left join ac on ac.producto_id=p.producto_id
  left join av on av.producto_id=p.producto_id
  left join mp on mp.producto_id=p.producto_id
  left join mv on mv.producto_id=p.producto_id;
$fn$;
grant execute on function public.snapshot_inventario_por_producto() to authenticated, service_role;

create table if not exists public.cierre_snapshot_producto (
  cierre_id uuid not null references public.cierres_mensuales(id) on delete cascade,
  momento text not null check (momento in ('inicio','fin')),
  producto_id uuid not null references public.productos(id),
  alm_granel_gramos bigint not null default 0,
  alm_granel_valor numeric(14,2) not null default 0,
  alm_cartuchos_unidades int not null default 0,
  alm_cartuchos_gramos bigint not null default 0,
  alm_cartuchos_valor numeric(14,2) not null default 0,
  alm_vasos_unidades int not null default 0,
  alm_vasos_valor numeric(14,2) not null default 0,
  maq_polvo_gramos bigint not null default 0,
  maq_polvo_valor numeric(14,2) not null default 0,
  maq_vasos_unidades int not null default 0,
  maq_vasos_valor numeric(14,2) not null default 0,
  aproximado boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (cierre_id, momento, producto_id)
);
alter table public.cierre_snapshot_producto enable row level security;
drop policy if exists csp_read on public.cierre_snapshot_producto;
create policy csp_read on public.cierre_snapshot_producto for select to authenticated using (true);
drop policy if exists csp_admin on public.cierre_snapshot_producto;
create policy csp_admin on public.cierre_snapshot_producto for all to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role) or user_has_role('almacen'::app_role))
  with check (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role) or user_has_role('almacen'::app_role));

-- NOTA: abrir_cierre_mensual y cerrar_cierre_mensual se redefinen aquí para
-- poblar cierre_snapshot_producto (inicio encadenado / fin al cerrar). Los
-- cuerpos completos están aplicados en el proyecto remoto; ver funciones
-- abrir_cierre_mensual/cerrar_cierre_mensual vigentes.
