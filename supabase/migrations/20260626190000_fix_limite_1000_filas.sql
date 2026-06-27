-- ============================================================================
-- Fix: PostgREST limitaba a 1000 filas por request, truncando KPIs/agregados
-- que se calculaban trayendo todas las ventas y sumando en JS. Con 7000+
-- ventas/mes, los totales del dashboard, ventas y reporte de cierre salían
-- subestimados.
--
-- Dos medidas complementarias:
--   1. Subir db_max_rows a 200k a nivel de rol (arregla todo el código que
--      usa .range() sin refactor).
--   2. RPC agregar_ventas() que calcula los agregados EN LA BASE (sum/count),
--      usada por la página de ventas — correcto y rápido sin transferir miles
--      de filas.
-- ============================================================================

alter role authenticated set pgrst.db_max_rows = '200000';
alter role anon set pgrst.db_max_rows = '200000';

create or replace function public.agregar_ventas(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_cliente_id uuid default null,
  p_maquina_id uuid default null,
  p_producto_id uuid default null,
  p_metodo text default null,
  p_solo_negativas boolean default false
) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $fn$
with vf as (
  select v.*,
         (v.fecha_transaccion at time zone 'America/Mexico_City')::date as dia_cdmx
    from public.ventas_maquina v
   where v.fecha_transaccion >= p_desde
     and v.fecha_transaccion <= p_hasta
     and (p_cliente_id is null or v.cliente_id = p_cliente_id)
     and (p_maquina_id is null or v.maquina_id = p_maquina_id)
     and (p_producto_id is null or v.producto_id = p_producto_id)
     and (p_metodo is null or v.metodo_pago = p_metodo)
     and (not p_solo_negativas or v.utilidad_bruta < 0)
),
kpis as (
  select jsonb_build_object(
    'n_ventas', count(*),
    'venta_publico', coalesce(sum(precio_bruto),0),
    'comision_nayax', coalesce(sum(comision_nayax_estimada),0),
    'venta_bruta', coalesce(sum(precio_neto),0),
    'costo_polvo', coalesce(sum(costo_polvo),0),
    'costo_vaso', coalesce(sum(costo_vaso),0),
    'utilidad', coalesce(sum(utilidad_bruta),0),
    'gramos', coalesce(sum(gramos_dispensados),0),
    'margen_prom', case when count(*)>0 then coalesce(avg(margen_porcentaje),0) else 0 end,
    'ticket_prom', case when count(*)>0 then coalesce(sum(precio_neto),0)/count(*) else 0 end
  ) j from vf
),
por_dia as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.fecha), '[]'::jsonb) j
  from (select dia_cdmx::text as fecha, sum(precio_neto) as ingresos from vf group by dia_cdmx) t
),
por_cliente as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.valor desc), '[]'::jsonb) j
  from (select coalesce(c.nombre,'(sin cliente)') as cliente, sum(vf.precio_neto) as valor
          from vf left join public.clientes c on c.id = vf.cliente_id
         group by coalesce(c.nombre,'(sin cliente)')) t
),
por_maquina as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.ingresos desc), '[]'::jsonb) j
  from (select vf.maquina_id as filter_id, m.serie, m.alias,
               sum(vf.precio_neto) as ingresos, sum(vf.utilidad_bruta) as utilidad, count(*) as ventas
          from vf join public.maquinas m on m.id = vf.maquina_id
         group by vf.maquina_id, m.serie, m.alias) t
),
por_producto as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.ingresos desc), '[]'::jsonb) j
  from (
    select coalesce(p.sku, 'receta') as sku,
           coalesce(p.nombre, regexp_replace(vf.notas, '^Receta:\s*', '')) as nombre,
           case when vf.producto_id is not null then vf.producto_id::text else '' end as filter_id,
           (vf.producto_id is null) as es_receta,
           sum(vf.precio_neto) as ingresos, sum(vf.utilidad_bruta) as utilidad, count(*) as ventas
      from vf left join public.productos p on p.id = vf.producto_id
     where vf.producto_id is not null or (vf.notas ~ '^Receta:')
     group by coalesce(p.sku,'receta'),
              coalesce(p.nombre, regexp_replace(vf.notas, '^Receta:\s*', '')),
              case when vf.producto_id is not null then vf.producto_id::text else '' end,
              (vf.producto_id is null)
  ) t
)
select jsonb_build_object(
  'kpis', (select j from kpis),
  'por_dia', (select j from por_dia),
  'por_cliente', (select j from por_cliente),
  'por_maquina', (select j from por_maquina),
  'por_producto', (select j from por_producto)
);
$fn$;

grant execute on function public.agregar_ventas(timestamptz, timestamptz, uuid, uuid, uuid, text, boolean) to authenticated;
