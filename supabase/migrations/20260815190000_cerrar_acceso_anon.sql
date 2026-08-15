-- ============================================================================
-- Cierra el acceso de `anon` — el hueco que quedó fuera de 20260815180001
--
-- Contexto: al cerrar las 50 policies de lectura descubrimos que el rol `anon`
-- (la publishable key, que es pública por diseño) todavía llegaba a datos
-- financieros por dos caminos que RLS no cubre:
--
--   1. Cuatro vistas SECURITY DEFINER con SELECT otorgado a `anon`. Una vista
--      SECURITY DEFINER corre con los permisos de quien la creó, así que ignora
--      RLS por completo. Comprobado en producción: sin sesión alguna se leían
--      v_inventario_producto (31 productos con costo), v_capital_trabajo,
--      vista_reporte_cierre y v_health_checks, mientras la tabla `productos`
--      devolvía 0 filas correctamente.
--
--   2. EXECUTE sobre funciones SECURITY DEFINER, incluidas mutantes
--      (`cerrar_cierre_mensual`, `aplicar_conteo_almacen`, `agregar_ventas`,
--      `procesar_venta_nayax`, `recibir_devolucion`, …). Viene del
--      `alter default privileges` de Supabase, que otorga EXECUTE a `anon`
--      sobre cada función nueva del esquema public — por eso hasta
--      `user_es_interno()`, creada con `revoke ... from public`, salió con
--      grant a `anon`.
-- ============================================================================

-- ── 1. Las vistas pasan a respetar RLS ───────────────────────────────────────
-- Con security_invoker la vista se evalúa con los permisos de quien consulta,
-- así que las policies de las tablas base vuelven a aplicar.
--
-- Verificado antes de aplicar que no cambia nada para el personal interno:
--   v_capital_trabajo      — no se consume desde la app
--   v_inventario_producto  — /almacen/inventario (admin, direccion, almacen, compras);
--                            encartuchados, lotes y productos tienen policy user_es_interno()
--   vista_reporte_cierre   — /admin/cierres/[id] (admin, direccion);
--                            cierres_mensuales, movimientos_inventario y pesajes_maquina idem
--   v_health_checks        — /admin/supervision (admin, direccion) y el cron diario.
--                            Lee maquina_items y maquina_item_ingredientes, que solo
--                            tienen policy admin/direccion: por eso importa que sus dos
--                            consumidores sean admin. El cron usa service_role, que
--                            bypasea RLS.
-- `tesoreria_ro` tiene rolbypassrls, así que tampoco le afecta.
alter view public.v_capital_trabajo     set (security_invoker = true);
alter view public.v_inventario_producto set (security_invoker = true);
alter view public.vista_reporte_cierre  set (security_invoker = true);
alter view public.v_health_checks       set (security_invoker = true);

revoke select on public.v_capital_trabajo     from anon;
revoke select on public.v_inventario_producto from anon;
revoke select on public.vista_reporte_cierre  from anon;
revoke select on public.v_health_checks       from anon;

-- ── 2. `anon` deja de poder ejecutar los RPC de negocio ──────────────────────
-- Se recorre el catálogo en lugar de listar nombres para que no se desfase
-- cuando se agreguen funciones, y para que la migración sea idempotente.
--
-- Se excluyen a propósito user_es_interno() y user_cliente_id(): las expresiones
-- de una policy se evalúan con los privilegios de quien consulta, así que si
-- `anon` pierde EXECUTE sobre ellas, cualquier SELECT suyo pasaría de devolver
-- 0 filas a reventar con "permission denied for function". Ninguna de las dos
-- filtra nada: para `anon` devuelven false y null respectivamente.
--
-- Hay que revocar de `anon` Y de `public`: estas funciones tienen las dos vías
-- (`=X/postgres` es el grant a PUBLIC que Postgres pone por default al crear
-- una función). Revocar solo de `anon` deja el acceso vivo por PUBLIC — pasó
-- al aplicar esto: de 41 funciones solo se cerraron 20.
-- Revocar de PUBLIC es seguro porque `authenticated` y `service_role` tienen
-- grant explícito propio (`authenticated=X/postgres`), no dependen de PUBLIC.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.proname not in ('user_es_interno', 'user_cliente_id')
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public', r.firma);
    execute format('revoke execute on function %s from anon',   r.firma);
  end loop;
end $$;

-- ── 3. Que las funciones nuevas ya no nazcan abiertas ────────────────────────
-- El primero contrarresta el default de Supabase (grant a anon); el segundo,
-- el default de Postgres (EXECUTE a PUBLIC). A partir de aquí, una función que
-- de verdad deba ser pública necesita su `grant execute ... to anon` explícito.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;
