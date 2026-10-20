-- ============================================================================
-- 146 · Portal del cliente: vistas de solo lectura, acotadas y sin costos
--
-- Qué se pidió
-- ------------
-- Smart Fit quiere ver toda su operación, no solo las visitas de servicio que
-- ve hoy. Sin poder editar nada, y sin ver un solo dato de otro cliente.
--
-- Por qué vistas y no políticas sobre las tablas
-- ----------------------------------------------
-- **RLS filtra renglones, no columnas.** Si a `ventas_maquina` le ponemos una
-- policy de lectura para el rol `cliente`, Smart Fit vería sus renglones — con
-- TODAS sus columnas, incluidas `costo_polvo`, `costo_vaso`, `utilidad_bruta`
-- y `margen_porcentaje`. Es decir, nuestro margen en cada malteada. Lo mismo
-- con `tolvas.costo_promedio_g_actual`.
--
-- Por eso el cliente no toca las tablas: toca estas vistas, que solo tienen
-- las columnas que decidimos enseñar. La columna de margen no está oculta —
-- no existe en lo que ellos consultan.
--
-- Las vistas se dejan a propósito con `security_invoker = false` (el default
-- de Postgres): corren con los permisos del dueño, así que no hace falta
-- abrirle RLS al cliente sobre las tablas base. El acotamiento lo hace la
-- vista misma con `user_cliente_id()`, que devuelve el cliente del usuario
-- SOLO si trae el rol `cliente`, y null para cualquier interno.
--
-- Consecuencia de ese diseño, a tener presente: un usuario interno
-- (dirección, planeador) ve CERO renglones en estas vistas, porque su
-- `user_cliente_id()` es null. Para revisar qué ve el cliente hay que entrar
-- con una cuenta de cliente. Es más seguro así que agregarle una puerta a
-- dirección que después nadie recuerde que existe.
--
-- Escritura: no se agrega ninguna. El rol `cliente` no tiene hoy una sola
-- policy de INSERT/UPDATE/DELETE en las 69 tablas, y esta migración no rompe
-- esa propiedad. Las vistas son de lectura y punto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Máquinas del cliente
-- ----------------------------------------------------------------------------
create or replace view public.v_cliente_maquinas as
select
  m.id,
  m.serie,
  m.alias,
  m.tipo,
  m.estado,
  u.nombre              as ubicacion,
  u.direccion           as ubicacion_direccion,
  m.num_tolvas,
  m.requiere_agua,
  m.ultima_visita_at,
  m.fecha_instalacion,
  -- Señal de máquina muda: el mismo umbral que usa la alerta interna, para
  -- que el cliente y nosotros no veamos cosas distintas.
  (
    select max(v.fecha_transaccion)
      from public.ventas_maquina v
     where v.maquina_id = m.id
  ) as ultima_venta_at
from public.maquinas m
join public.ubicaciones u on u.id = m.ubicacion_id
where m.activo
  and u.cliente_id = public.user_cliente_id();

-- ----------------------------------------------------------------------------
-- Tolvas: qué trae cada máquina y qué tan llena está.
-- Sin `costo_promedio_g_actual`: ese es nuestro costo, no su asunto.
-- ----------------------------------------------------------------------------
create or replace view public.v_cliente_tolvas as
select
  t.id,
  t.maquina_id,
  t.numero,
  p.nombre              as producto,
  p.sabor,
  t.gramaje_servicio,
  t.inventario_actual_g,
  coalesce(t.capacidad_max_g_override, t.capacidad_max_g) as capacidad_g,
  case
    when coalesce(t.capacidad_max_g_override, t.capacidad_max_g) > 0
      then round(
        100.0 * t.inventario_actual_g
        / coalesce(t.capacidad_max_g_override, t.capacidad_max_g)
      )
    else null
  end                   as porcentaje_lleno,
  t.ultimo_llenado_at
from public.tolvas t
join public.maquinas m on m.id = t.maquina_id
join public.ubicaciones u on u.id = m.ubicacion_id
left join public.productos p on p.id = t.producto_id
where m.activo
  and u.cliente_id = public.user_cliente_id();

-- ----------------------------------------------------------------------------
-- Bitácora de visitas: quién fue, cuándo y qué dejó hecho.
-- ----------------------------------------------------------------------------
create or replace view public.v_cliente_visitas as
select
  ci.id,
  ci.maquina_id,
  m.serie,
  m.alias               as maquina,
  u.nombre              as ubicacion,
  pr.full_name          as operador,
  ci.fecha_entrada,
  ci.fecha_salida,
  ci.tiempo_en_sitio_seg,
  ci.checkout_nayax_ok,
  ci.checkout_maquina_limpia,
  ci.checkout_productos_ok,
  exists (
    select 1 from public.llenados l where l.check_in_id = ci.id
  )                     as hubo_llenado
from public.check_ins ci
join public.maquinas m on m.id = ci.maquina_id
join public.ubicaciones u on u.id = m.ubicacion_id
left join public.profiles pr on pr.id = ci.operador_id
where u.cliente_id = public.user_cliente_id();

-- ----------------------------------------------------------------------------
-- Incidencias de sus sedes.
-- Se dejan fuera las columnas de merma y cartuchos afectados: eso es manejo
-- interno de inventario y no le dice nada útil al cliente.
-- ----------------------------------------------------------------------------
create or replace view public.v_cliente_incidencias as
select
  i.id,
  i.folio,
  i.tipo,
  i.severidad,
  i.maquina_id,
  m.serie,
  m.alias               as maquina,
  u.nombre              as ubicacion,
  i.descripcion,
  i.estado,
  i.fecha_apertura,
  i.fecha_cierre,
  i.notas_resolucion
from public.incidencias i
join public.maquinas m on m.id = i.maquina_id
join public.ubicaciones u on u.id = m.ubicacion_id
where u.cliente_id = public.user_cliente_id();

-- ----------------------------------------------------------------------------
-- Quejas de sus usuarios finales.
-- Sin teléfono (ni los últimos 4 ni el hash) y sin los montos: el teléfono es
-- dato personal de un tercero y los montos son cómo resolvemos nosotros.
-- El cliente ve que hubo una queja, de qué, y si se resolvió.
-- ----------------------------------------------------------------------------
create or replace view public.v_cliente_quejas as
select
  q.id,
  q.folio,
  q.fecha_reporte,
  q.maquina_id,
  m.serie,
  m.alias               as maquina,
  u.nombre              as ubicacion,
  q.tipo,
  q.descripcion,
  q.estado,
  q.procede,
  q.fecha_cierre
from public.quejas q
join public.maquinas m on m.id = q.maquina_id
join public.ubicaciones u on u.id = m.ubicacion_id
where u.cliente_id = public.user_cliente_id();

-- ----------------------------------------------------------------------------
-- Ventas por máquina y día: volumen e ingreso bruto.
--
-- Dirección autorizó volumen + ingreso. Lo que NO sale de aquí, y no debe
-- agregarse después sin volver a preguntar:
--   costo_polvo, costo_vaso, utilidad_bruta, margen_porcentaje  → nuestro margen
--   comision_nayax_estimada, precio_neto                        → nuestro trato con Nayax
--
-- El corte del día es en CDMX. Nayax guarda en UTC y una venta de las 8 de la
-- noche caería en el día siguiente si no se convierte.
-- ----------------------------------------------------------------------------
create or replace view public.v_cliente_ventas_dia as
select
  (v.fecha_transaccion at time zone 'America/Mexico_City')::date as dia,
  v.maquina_id,
  m.serie,
  m.alias               as maquina,
  u.nombre              as ubicacion,
  count(*)              as unidades,
  sum(v.gramos_dispensados)             as gramos,
  round(sum(v.precio_bruto), 2)         as ingreso_bruto,
  round(sum(v.precio_sin_iva), 2)       as ingreso_sin_iva,
  round(sum(v.iva), 2)                  as iva
from public.ventas_maquina v
join public.maquinas m on m.id = v.maquina_id
join public.ubicaciones u on u.id = m.ubicacion_id
where u.cliente_id = public.user_cliente_id()
group by 1, 2, 3, 4, 5;

-- ----------------------------------------------------------------------------
-- Ventas por producto: qué sabores se venden en sus sedes.
-- Es el dato que más les sirve para su propia operación de gimnasio.
-- ----------------------------------------------------------------------------
create or replace view public.v_cliente_ventas_producto as
select
  (v.fecha_transaccion at time zone 'America/Mexico_City')::date as dia,
  v.maquina_id,
  m.alias               as maquina,
  u.nombre              as ubicacion,
  coalesce(v.notas, p.nombre, 'Sin nombre') as bebida,
  count(*)              as unidades,
  round(sum(v.precio_bruto), 2) as ingreso_bruto
from public.ventas_maquina v
join public.maquinas m on m.id = v.maquina_id
join public.ubicaciones u on u.id = m.ubicacion_id
left join public.productos p on p.id = v.producto_id
where u.cliente_id = public.user_cliente_id()
group by 1, 2, 3, 4, 5;

-- ----------------------------------------------------------------------------
-- Permisos. `authenticated` cubre a los usuarios con sesión; el acotamiento
-- real lo hace `user_cliente_id()` dentro de cada vista, que es null para
-- cualquiera que no traiga el rol `cliente`.
-- `anon` no recibe nada: el acceso sin sesión se cerró en ago-2026.
-- ----------------------------------------------------------------------------
do $$
declare v text;
begin
  foreach v in array array[
    'v_cliente_maquinas', 'v_cliente_tolvas', 'v_cliente_visitas',
    'v_cliente_incidencias', 'v_cliente_quejas',
    'v_cliente_ventas_dia', 'v_cliente_ventas_producto'
  ] loop
    execute format('revoke all on public.%I from public, anon', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

comment on view public.v_cliente_maquinas is
  'Portal del cliente: sus máquinas activas. Acotada por user_cliente_id(); sin costos.';
comment on view public.v_cliente_tolvas is
  'Portal del cliente: qué trae y qué tan llena está cada tolva. Sin costo por gramo.';
comment on view public.v_cliente_visitas is
  'Portal del cliente: bitácora de visitas a sus sedes.';
comment on view public.v_cliente_incidencias is
  'Portal del cliente: incidencias de sus máquinas. Sin merma ni cartuchos afectados.';
comment on view public.v_cliente_quejas is
  'Portal del cliente: quejas de sus usuarios finales. Sin teléfono ni montos.';
comment on view public.v_cliente_ventas_dia is
  'Portal del cliente: volumen e ingreso bruto por máquina y día (CDMX). NUNCA costos ni margen.';
comment on view public.v_cliente_ventas_producto is
  'Portal del cliente: volumen e ingreso bruto por bebida. NUNCA costos ni margen.';
