-- ============================================================================
-- 154 · Cuatro chequeos nuevos: los que habrían cachado lo del chocolate
--
-- El caso de la caja de chocolate no se detectó por falta de datos. Se detectó
-- tres meses tarde porque nadie preguntaba. Estos chequeos preguntan.
--
-- Por qué se parte en dos vistas
-- ------------------------------
-- `v_health_checks` son ~7.5 KB de SQL. Para agregarle cuatro ramas habría que
-- volver a escribir las diez que ya tiene, y copiar a mano SQL que hoy funciona
-- en producción es exactamente la clase de riesgo que no vale la pena correr
-- por cuatro `union all`. Así que la vista de siempre se renombra —queda
-- intacta, ni una letra movida— y la que lleva el nombre público pasa a ser la
-- suma de las dos:
--
--   v_health_checks_operacion   ← las 10 de siempre (planograma, receta, rutas)
--   v_health_checks_integridad  ← las 4 nuevas (cantidades que no cuadran)
--   v_health_checks             ← las dos juntas; nadie afuera se entera
--
-- Los cuatro chequeos
-- -------------------
--   tolva_desbordada · Crítico. Arriba del doble de su capacidad. Desde la
--        migración 20261031190000 el llenado ya no puede provocarlo, así que
--        si aparece es que entró por otro lado y hay que ir a ver por dónde.
--   tolva_sobre_capacidad · Advertencia. Entre 100% y 200%. Hoy hay 49 y el
--        exceso máximo son 347 g: ruido normal de cartuchos de 400 g entrando
--        a tolvas casi llenas. No es alarma, es un número que conviene mirar
--        de reojo: si empieza a crecer, algo cambió.
--   encartuchado_gramaje_atipico · Crítico. Un cartucho disponible que no pesa
--        lo que el producto dice que pesa. Es la firma exacta del error del
--        chocolate, y lo habría delatado el 30 de julio.
--   nayax_descartes_24h · Crítico. Ventas que llegaron de Nayax y no se
--        pudieron registrar. Octubre tuvo dos incidentes de éstos ($3,070 en
--        70 transacciones) y los dos se encontraron a mano, días después.
-- ============================================================================

alter view public.v_health_checks rename to v_health_checks_operacion;

comment on view public.v_health_checks_operacion is
  'Chequeos de configuración: planograma, recetas, rutas, kardex. Los de integridad de cantidades viven en v_health_checks_integridad. Se consultan juntos en v_health_checks.';

create view public.v_health_checks_integridad
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
 where d.created_at > now() - interval '24 hours';

comment on view public.v_health_checks_integridad is
  'Chequeos de cantidades que no cuadran, nacidos del caso de la caja de chocolate (oct-2026). Ver migración 20261031191500.';

create view public.v_health_checks
with (security_invoker = true) as
  select * from public.v_health_checks_operacion
  union all
  select * from public.v_health_checks_integridad;

comment on view public.v_health_checks is
  'Todos los chequeos de salud del sistema. Es la suma de v_health_checks_operacion y v_health_checks_integridad; los nuevos se agregan a la segunda.';

grant select on public.v_health_checks_operacion to authenticated;
grant select on public.v_health_checks_integridad to authenticated;
grant select on public.v_health_checks to authenticated;
