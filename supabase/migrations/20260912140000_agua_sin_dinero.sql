-- ============================================================================
-- El agua se queda en unidades físicas: fuera el dinero.
--
-- Cuando se diseñó el módulo se dejaron dos columnas de costo "de referencia",
-- con la idea de que si algún día se decidía costear el agua el histórico ya
-- estuviera. Dirección lo corrigió (12-sep-2026): **el gasto del agua vive en
-- la app de tesorería**, y este módulo se remite a la operación. Dos lugares
-- para el mismo gasto es peor que uno solo, aunque el segundo sea "informativo":
-- tarde o temprano alguien compara los dos y no cuadran.
--
-- Si algún día se costea el agua, el precio saldrá de tesorería —que es su
-- fuente real— aplicado sobre los litros que este módulo sí registra.
--
-- Las columnas se dropean sin pérdida: ambas están en cero filas capturadas.
-- La vista se dropea y se recrea porque cambia su lista de columnas.
-- ============================================================================

alter table public.agua_maquina_eventos     drop column if exists costo_referencia;
alter table public.agua_almacen_movimientos drop column if exists costo_referencia;

drop view if exists public.v_agua_origen_30d;

create view public.v_agua_origen_30d as
select coalesce(sum(ml_cargados) filter (where origen = 'almacen'), 0) / 1000         as litros_almacen,
       coalesce(sum(ml_cargados) filter (where origen = 'compra_operador'), 0) / 1000 as litros_compra_operador,
       coalesce(sum(garrafones) filter (where origen = 'almacen'), 0)::int            as garrafones_almacen,
       count(distinct maquina_id) filter (where origen = 'compra_operador')::int      as maquinas_surtidas_en_tienda
  from public.agua_maquina_eventos
 where tipo = 'carga' and fecha >= now() - interval '30 days';

alter view public.v_agua_origen_30d set (security_invoker = true);

comment on view public.v_agua_origen_30d is
  'Litros de agua por origen en 30 dias. Que litros_compra_operador tienda a cero es la medida de si el plan de la camioneta funciono. Sin dinero: el gasto vive en tesoreria.';
