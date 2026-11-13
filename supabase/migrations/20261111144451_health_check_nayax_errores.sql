-- ============================================================================
-- 156 · El chequeo que faltaba: errores de ingesta de Nayax
--
-- La migración 20261031190132 agregó `nayax_descartes_24h`, que mira la tabla
-- `nayax_mensajes_descartados`. Se quedó corto, y costó caro.
--
-- Esa tabla solo recibía un caso: la venta sin PA Code. El otro modo de fallo
-- —"Máquina con nayax_machine_id X no encontrada"— nunca escribía ahí. Solo
-- sumaba uno a `nayax_sync_log.errores` y dejaba el texto en `mensaje_error`,
-- que es justamente donde nadie mira.
--
-- En noviembre se cambiaron 9 dispositivos Nayax. Cada uno empezó a reportar
-- con un Machine ID nuevo que el catálogo no conocía, y **ocho máquinas se
-- quedaron mudas siete días** sin que se encendiera una sola alarma. El
-- chequeo que yo había puesto miraba hacia el lado equivocado.
--
-- Los dos chequeos nuevos cubren el hueco desde los dos extremos:
--
--   nayax_errores_ingesta · Lo que está fallando ahorita. Cualquier error de
--        ingesta en las últimas 2 horas. El cron corre cada 2 minutos, así que
--        2 horas son ~60 corridas: si hay errores en esa ventana, es un
--        problema vivo, no un tropiezo aislado.
--
--   maquina_sin_venta_48h · Lo que dejó de llegar. Una máquina de venta activa
--        que vendía y de pronto no vende nada en 48 h. Es la red de seguridad
--        de verdad: no depende de que el error se vea ni de qué forma tenga,
--        solo de que el dinero dejó de aparecer. Cualquier futura manera de
--        romper la ingesta —una que todavía no imaginamos— cae aquí.
--
--        Se excluyen las de `tipo = 'servicio'`, que no venden (CLAUDE.md
--        §4.5), y las que nunca han vendido: una máquina recién instalada sin
--        historial no es una alarma, es una máquina nueva.
-- ============================================================================

create or replace view public.v_health_checks_integridad
with (security_invoker = true) as

select 'tolva_desbordada'::text as id,
       'Tolvas arriba del doble de su capacidad'::text as titulo,
       'Físicamente imposible: es un gramaje mal capturado. La máquina se ve llena, no entra a la sugerencia de resurtido y se vacía sin avisar.'::text as descripcion,
       count(*) as conteo,
       case when count(*) = 0 then 'ok' else 'critico' end::text as severidad,
       'integridad'::text as categoria
  from public.tolvas t
  join public.maquinas m on m.id = t.maquina_id
 where m.activo
   and coalesce(t.capacidad_max_g_override, t.capacidad_max_g) > 0
   and t.inventario_actual_g > coalesce(t.capacidad_max_g_override, t.capacidad_max_g) * 2

union all

select 'tolva_sobre_capacidad'::text,
       'Tolvas arriba de su capacidad'::text,
       'Entre 100% y 200%. Un poco de exceso es normal (cartucho entrando a tolva casi llena). Vale la pena mirarlo si el número crece.'::text,
       count(*),
       case when count(*) = 0 then 'ok' else 'advertencia' end::text,
       'integridad'::text
  from public.tolvas t
  join public.maquinas m on m.id = t.maquina_id
 where m.activo
   and coalesce(t.capacidad_max_g_override, t.capacidad_max_g) > 0
   and t.inventario_actual_g > coalesce(t.capacidad_max_g_override, t.capacidad_max_g)
   and t.inventario_actual_g <= coalesce(t.capacidad_max_g_override, t.capacidad_max_g) * 2

union all

select 'encartuchado_gramaje_atipico'::text,
       'Cartuchos disponibles con gramaje distinto al del producto'::text,
       'Un cartucho que no pesa lo que el producto dice. Es la firma del error de unidades de la presentación: revisa el catálogo del proveedor antes de surtirlo.'::text,
       count(*),
       case when count(*) = 0 then 'ok' else 'critico' end::text,
       'integridad'::text
  from public.encartuchados e
  join public.productos p on p.id = e.producto_id
 where e.cantidad_disponible > 0
   and p.gramaje_cartucho_default is not null
   and p.gramaje_cartucho_default > 0
   and e.gramos_por_cartucho <> p.gramaje_cartucho_default

union all

select 'nayax_descartes_24h'::text,
       'Ventas de Nayax descartadas en las últimas 24 h'::text,
       'Llegaron de Nayax y no se pudieron registrar. El payload queda guardado en nayax_mensajes_descartados: cada uno es dinero cobrado que no está en nuestros números.'::text,
       count(*),
       case when count(*) = 0 then 'ok' else 'critico' end::text,
       'integridad'::text
  from public.nayax_mensajes_descartados d
 where d.created_at > now() - interval '24 hours'

union all

select 'nayax_errores_ingesta'::text,
       'Errores de ingesta de Nayax en las últimas 2 h'::text,
       'El poll está fallando al registrar ventas. La causa más común es un Machine ID que el catálogo no conoce, normalmente tras cambiar un dispositivo. Mientras dure, esas ventas no entran. Revisa Admin → Nayax.'::text,
       coalesce(sum(s.errores), 0),
       case when coalesce(sum(s.errores), 0) = 0 then 'ok' else 'critico' end::text,
       'integridad'::text
  from public.nayax_sync_log s
 where s.inicio > now() - interval '2 hours'

union all

select 'maquina_sin_venta_48h'::text,
       'Máquinas de venta sin una sola venta en 48 h'::text,
       'Vendía y dejó de hacerlo. Puede ser desabasto, una máquina apagada o que sus ventas ya no están llegando de Nayax. Las tres cuestan dinero y ninguna se arregla sola.'::text,
       count(*),
       case when count(*) = 0 then 'ok' else 'critico' end::text,
       'integridad'::text
  from public.maquinas m
 where m.activo
   and m.tipo <> 'servicio'
   and exists (select 1 from public.ventas_maquina v where v.maquina_id = m.id)
   and not exists (
     select 1 from public.ventas_maquina v
      where v.maquina_id = m.id
        and v.fecha_transaccion > now() - interval '48 hours');

comment on view public.v_health_checks_integridad is
  'Chequeos de cantidades que no cuadran y de ingesta que se rompe. Nacidos del caso de la caja de chocolate (oct-2026) y del cambio de dispositivos Nayax (nov-2026). Ver migraciones 20261031190132 y 20261111144451.';
