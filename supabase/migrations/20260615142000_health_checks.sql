-- ============================================================================
-- 70 · Health checks operativos
--
-- Vista v_health_checks con N validaciones (una fila por check). Cada fila
-- regresa id, título, descripción, conteo, severidad (ok|advertencia|critico)
-- y categoría. Se consume on-demand desde la UI y en un cron diario que
-- guarda snapshot en health_check_runs.
-- ============================================================================

create or replace view public.v_health_checks as
select
  'planograma_tolva_sin_producto' as id,
  'Tolvas con PA Code sin producto' as titulo,
  'Tolvas activas que tienen nayax_item_code pero no producto_id. Las ventas Nayax fallarán.' as descripcion,
  count(*) as conteo,
  case when count(*) = 0 then 'ok' else 'critico' end as severidad,
  'planograma' as categoria
from tolvas t join maquinas m on m.id = t.maquina_id
where m.activo = true and m.tipo = 'polvo_directo'
  and t.nayax_item_code is not null and t.producto_id is null
union all
select 'planograma_tolva_sin_gramaje',
  'Tolvas con PA Code sin gramaje_servicio',
  'Tolvas con nayax_item_code pero sin gramaje configurado. El RPC fallará al procesar la venta.',
  count(*),
  case when count(*) = 0 then 'ok' else 'critico' end,
  'planograma'
from tolvas t join maquinas m on m.id = t.maquina_id
where m.activo = true and m.tipo = 'polvo_directo'
  and t.nayax_item_code is not null
  and (t.gramaje_servicio is null or t.gramaje_servicio <= 0)
union all
select 'receta_tolva_sin_producto',
  'Tolvas usadas en recetas sin producto',
  'Tolvas referenciadas por ingredientes de receta pero sin producto_id. Inventario se descontará pero kardex quedará incompleto.',
  count(distinct t.id),
  case when count(distinct t.id) = 0 then 'ok' else 'critico' end,
  'receta'
from maquina_item_ingredientes mii
join tolvas t on t.id = mii.tolva_id
join maquinas m on m.id = t.maquina_id
where m.activo = true and t.producto_id is null
union all
select 'preparado_sin_recetas',
  'Máquinas preparado sin recetas configuradas',
  'Máquinas tipo preparado activas que no tienen maquina_items. Ninguna venta podrá procesarse.',
  count(*),
  case when count(*) = 0 then 'ok' else 'critico' end,
  'receta'
from maquinas m
where m.activo = true and m.tipo = 'preparado'
  and not exists (select 1 from maquina_items mi where mi.maquina_id = m.id)
union all
select 'maquina_vaso_sin_producto',
  'Máquinas con capacidad de vaso sin vaso_producto_id',
  'Si la máquina dispensa vaso pero no se sabe qué producto es, el costo del vaso quedará en 0.',
  count(*),
  case when count(*) = 0 then 'ok' else 'critico' end,
  'planograma'
from maquinas m
where m.activo = true and m.vaso_producto_id is null
  and m.vaso_capacidad_max > 0
union all
select 'tolva_inventario_sin_costo',
  'Tolvas con inventario pero sin costo (no-test)',
  'El kardex registrará costo 0 y la utilidad reportada estará inflada. Se excluyen máquinas TEST.',
  count(*),
  case when count(*) = 0 then 'ok' else 'advertencia' end,
  'kardex'
from tolvas t join maquinas m on m.id = t.maquina_id
where m.activo = true
  and t.inventario_actual_g > 0
  and coalesce(t.costo_promedio_g_actual, 0) = 0
  and m.serie not ilike 'TEST%' and m.serie not ilike '%PENDIENTE%'
union all
select 'producto_sin_gramaje_cartucho',
  'Productos polvo sin gramaje_cartucho_default',
  'El sugerido de surtido no podrá calcular cuántos cartuchos llevar de este producto.',
  count(*),
  case when count(*) = 0 then 'ok' else 'advertencia' end,
  'catalogo'
from productos
where activo = true and tipo = 'polvo'
  and (gramaje_cartucho_default is null or gramaje_cartucho_default <= 0)
union all
select 'maquina_sin_ruta',
  'Máquinas activas sin ruta asignada',
  'La máquina no aparece en ninguna ruta base. Nunca se asignará a un operador.',
  count(*),
  case when count(*) = 0 then 'ok' else 'advertencia' end,
  'rutas'
from maquinas m
where m.activo = true
  and not exists (select 1 from ruta_maquinas rm where rm.maquina_id = m.id)
union all
select 'venta_sin_kardex_polvo',
  'Ventas con gramos > 0 sin movimiento kardex polvo (24h)',
  'La venta se registró pero el movimiento de salida de tolva no se creó. Inconsistencia en kardex.',
  count(*),
  case when count(*) = 0 then 'ok' else 'advertencia' end,
  'kardex'
from ventas_maquina v
where v.gramos_dispensados > 0
  and v.fecha_transaccion > now() - interval '24 hours'
  and not exists (
    select 1 from movimientos_inventario mi
    where mi.referencia_id = v.id and mi.referencia_tabla = 'ventas_maquina'
      and mi.presentacion = 'polvo_en_tolva'
  )
union all
select 'tolva_inventario_negativo',
  'Tolvas con inventario negativo',
  'Bug del sistema: el inventario no debería ser negativo. Revisar inmediatamente.',
  count(*),
  case when count(*) = 0 then 'ok' else 'critico' end,
  'kardex'
from tolvas t join maquinas m on m.id = t.maquina_id
where m.activo = true and t.inventario_actual_g < 0;

grant select on public.v_health_checks to authenticated;


create table if not exists public.health_check_runs (
  id              uuid primary key default gen_random_uuid(),
  ejecutado_at    timestamptz not null default now(),
  total_checks    int not null,
  ok_count        int not null,
  warn_count      int not null,
  critical_count  int not null,
  detalles        jsonb not null,
  fuente          text not null check (fuente in ('cron','manual'))
);

create index if not exists health_check_runs_ejecutado_idx
  on public.health_check_runs(ejecutado_at desc);

alter table public.health_check_runs enable row level security;

create policy "health_check_runs_admin_select" on public.health_check_runs
  for select to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role));

create policy "health_check_runs_service_insert" on public.health_check_runs
  for insert to service_role with check (true);

create policy "health_check_runs_admin_insert" on public.health_check_runs
  for insert to authenticated
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role));
