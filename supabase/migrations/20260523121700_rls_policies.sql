-- ============================================================================
-- 17 · Row Level Security
-- Habilita RLS y crea policies base por rol en todas las tablas.
-- Esta es la capa base: dirección/admin pueden todo; resto puede leer.
-- Policies más finas (por rol específico) se añaden en migraciones posteriores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 17.1 · Helper: enable_rls_and_base_policies
-- Habilita RLS en una tabla y crea las policies base:
--   - select para cualquier authenticated
--   - all para admin y direccion
-- ----------------------------------------------------------------------------
do $$
declare
  tbl text;
  tables text[] := array[
    'profiles',
    'user_roles',
    'audit_log',
    'proveedores',
    'clientes',
    'productos',
    'presentaciones_proveedor',
    'ubicaciones',
    'maquinas',
    'tolvas',
    'planograma_historico',
    'config_global',
    'contratos_cliente',
    'rutas',
    'ruta_maquinas',
    'asignaciones_diarias',
    'asignacion_maquinas',
    'ordenes_compra',
    'oc_items',
    'recepciones',
    'lotes',
    'recepcion_items',
    'encartuchados',
    'encartuchado_lotes',
    'surtidos',
    'surtido_items',
    'jornadas',
    'check_ins',
    'llenados',
    'llenado_items',
    'incidencias',
    'devoluciones_almacen',
    'cierres_mensuales',
    'pesajes_maquina',
    'pesaje_tolva_items',
    'conteos_almacen',
    'conteo_granel_items',
    'conteo_cartuchos_items',
    'movimientos_inventario',
    'nayax_sync_log',
    'ventas_maquina',
    'reportes_cliente',
    'alertas',
    'calibraciones_maquina'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I enable row level security', tbl);

    -- Lectura: cualquier usuario autenticado
    execute format($f$
      create policy "%1$s_authenticated_read"
        on public.%1$I
        for select
        to authenticated
        using (true)
    $f$, tbl);

    -- Mutaciones: admin o direccion
    execute format($f$
      create policy "%1$s_admin_all"
        on public.%1$I
        for all
        to authenticated
        using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
        with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
    $f$, tbl);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 17.2 · Overrides puntuales
-- ----------------------------------------------------------------------------

-- profiles: cada usuario puede leer y actualizar su propio perfil
create policy "profiles_self_read"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_self_update"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- user_roles: el usuario puede ver sus propios roles
create policy "user_roles_self_read"
  on public.user_roles
  for select
  to authenticated
  using (user_id = auth.uid());

-- audit_log: nadie inserta desde el cliente. Solo lectura para admin/direccion
-- (la policy admin_all ya lo cubre; no agregamos lectura general)
drop policy "audit_log_authenticated_read" on public.audit_log;

-- movimientos_inventario es append-only desde triggers. No mutaciones desde la app.
-- (la policy admin_all queda para casos de ajuste manual autorizado).
