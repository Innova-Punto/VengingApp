-- ============================================================================
-- Acceso de cliente: Smart Fit ve las visitas de servicio de SUS sitios
--
-- Contexto y por qué esta migración es más grande de lo que parece:
-- hasta hoy 50 tablas tenían la policy de lectura en `using (true)`, es decir,
-- CUALQUIER usuario autenticado podía leer costos, órdenes de compra, ventas,
-- márgenes y proveedores pegándole directo a PostgREST con la anon key, que es
-- pública por diseño. Mientras todos los usuarios eran internos eso no se
-- notaba; al dar de alta al primer usuario de un cliente se vuelve una fuga.
--
-- Por eso el cambio es en dos partes:
--   1. Se cierran esas 50 policies a `user_es_interno()` — el personal interno
--      no nota diferencia, pero deja de ser "cualquier autenticado".
--   2. Se abren policies angostas y explícitas para el rol 'cliente', siempre
--      acotadas a SU cliente vía profiles.cliente_id.
-- ============================================================================

-- ── 1. Vínculo del usuario con su cliente ────────────────────────────────────
alter table public.profiles
  add column if not exists cliente_id uuid references public.clientes(id) on delete restrict;

comment on column public.profiles.cliente_id is
  'Solo para usuarios con rol cliente: acota TODO lo que pueden leer a ese cliente. Null en usuarios internos.';

create index if not exists profiles_cliente_idx on public.profiles(cliente_id)
  where cliente_id is not null;

-- ── 2. Helpers ───────────────────────────────────────────────────────────────
-- Interno = cualquiera de los 6 roles de operación. Se excluye 'cliente' a
-- propósito: un usuario de cliente nunca es interno.
create or replace function public.user_es_interno()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles ur
     where ur.user_id = auth.uid()
       and ur.role in ('admin'::app_role, 'direccion'::app_role, 'compras'::app_role,
                       'almacen'::app_role, 'planeador'::app_role, 'operador'::app_role)
  );
$$;

revoke all on function public.user_es_interno() from public;
grant execute on function public.user_es_interno() to authenticated;

-- Cliente al que pertenece el usuario (null si es interno o no tiene vínculo).
create or replace function public.user_cliente_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.cliente_id
    from public.profiles p
   where p.id = auth.uid()
     and exists (select 1 from public.user_roles ur
                  where ur.user_id = p.id and ur.role = 'cliente'::app_role);
$$;

revoke all on function public.user_cliente_id() from public;
grant execute on function public.user_cliente_id() to authenticated;

-- ── 3. Cerrar las lecturas abiertas ──────────────────────────────────────────
-- Mismo alcance de siempre para el personal interno; nada para los demás.
alter policy alertas_authenticated_read on public.alertas using (public.user_es_interno());
alter policy asignacion_maquinas_authenticated_read on public.asignacion_maquinas using (public.user_es_interno());
alter policy asignaciones_diarias_authenticated_read on public.asignaciones_diarias using (public.user_es_interno());
alter policy calibraciones_maquina_authenticated_read on public.calibraciones_maquina using (public.user_es_interno());
alter policy check_ins_authenticated_read on public.check_ins using (public.user_es_interno());
alter policy checklist_items_read on public.checklist_items using (public.user_es_interno());
alter policy checklist_plantillas_read on public.checklist_plantillas using (public.user_es_interno());
alter policy csp_read on public.cierre_snapshot_producto using (public.user_es_interno());
alter policy cierres_mensuales_authenticated_read on public.cierres_mensuales using (public.user_es_interno());
alter policy clientes_authenticated_read on public.clientes using (public.user_es_interno());
alter policy config_global_authenticated_read on public.config_global using (public.user_es_interno());
alter policy conteo_cartuchos_items_authenticated_read on public.conteo_cartuchos_items using (public.user_es_interno());
alter policy conteo_granel_items_authenticated_read on public.conteo_granel_items using (public.user_es_interno());
alter policy conteo_vasos_items_authenticated_read on public.conteo_vasos_items using (public.user_es_interno());
alter policy conteos_almacen_authenticated_read on public.conteos_almacen using (public.user_es_interno());
alter policy contratos_cliente_authenticated_read on public.contratos_cliente using (public.user_es_interno());
alter policy devoluciones_almacen_authenticated_read on public.devoluciones_almacen using (public.user_es_interno());
alter policy encartuchado_lotes_authenticated_read on public.encartuchado_lotes using (public.user_es_interno());
alter policy encartuchados_authenticated_read on public.encartuchados using (public.user_es_interno());
alter policy incidencias_authenticated_read on public.incidencias using (public.user_es_interno());
alter policy jornadas_authenticated_read on public.jornadas using (public.user_es_interno());
alter policy llenado_items_authenticated_read on public.llenado_items using (public.user_es_interno());
alter policy llenados_authenticated_read on public.llenados using (public.user_es_interno());
alter policy lotes_authenticated_read on public.lotes using (public.user_es_interno());
alter policy maquinas_authenticated_read on public.maquinas using (public.user_es_interno());
alter policy movimientos_inventario_authenticated_read on public.movimientos_inventario using (public.user_es_interno());
alter policy nayax_sync_log_authenticated_read on public.nayax_sync_log using (public.user_es_interno());
alter policy oc_items_authenticated_read on public.oc_items using (public.user_es_interno());
alter policy ordenes_compra_authenticated_read on public.ordenes_compra using (public.user_es_interno());
alter policy pesaje_tolva_items_authenticated_read on public.pesaje_tolva_items using (public.user_es_interno());
alter policy pesajes_maquina_authenticated_read on public.pesajes_maquina using (public.user_es_interno());
alter policy planograma_historico_authenticated_read on public.planograma_historico using (public.user_es_interno());
alter policy planograma_items_authenticated_read on public.planograma_items using (public.user_es_interno());
alter policy planogramas_authenticated_read on public.planogramas using (public.user_es_interno());
alter policy presentaciones_proveedor_authenticated_read on public.presentaciones_proveedor using (public.user_es_interno());
alter policy productos_authenticated_read on public.productos using (public.user_es_interno());
alter policy profiles_authenticated_read on public.profiles using (public.user_es_interno());
alter policy proveedores_authenticated_read on public.proveedores using (public.user_es_interno());
alter policy recepcion_items_authenticated_read on public.recepcion_items using (public.user_es_interno());
alter policy recepciones_authenticated_read on public.recepciones using (public.user_es_interno());
alter policy reportes_cliente_authenticated_read on public.reportes_cliente using (public.user_es_interno());
alter policy ruta_maquinas_authenticated_read on public.ruta_maquinas using (public.user_es_interno());
alter policy rutas_authenticated_read on public.rutas using (public.user_es_interno());
alter policy surtido_items_authenticated_read on public.surtido_items using (public.user_es_interno());
alter policy surtidos_authenticated_read on public.surtidos using (public.user_es_interno());
alter policy sustituciones_read on public.sustituciones_tolva using (public.user_es_interno());
alter policy tolvas_authenticated_read on public.tolvas using (public.user_es_interno());
alter policy ubicaciones_authenticated_read on public.ubicaciones using (public.user_es_interno());
alter policy user_roles_authenticated_read on public.user_roles using (public.user_es_interno());
alter policy ventas_maquina_authenticated_read on public.ventas_maquina using (public.user_es_interno());

-- ── 4. Lecturas explícitas del rol 'cliente' ─────────────────────────────────
-- Todas SELECT, todas acotadas por user_cliente_id(). Cubren exactamente lo
-- que necesitan las pantallas de Servicios y nada más.

-- Su propio cliente
create policy clientes_cliente_read on public.clientes
  for select to authenticated
  using (id = public.user_cliente_id());

-- Sus ubicaciones
create policy ubicaciones_cliente_read on public.ubicaciones
  for select to authenticated
  using (cliente_id = public.user_cliente_id());

-- Las máquinas instaladas en sus ubicaciones
create policy maquinas_cliente_read on public.maquinas
  for select to authenticated
  using (exists (
    select 1 from public.ubicaciones u
     where u.id = maquinas.ubicacion_id
       and u.cliente_id = public.user_cliente_id()
  ));

-- Las visitas de servicio a esas máquinas
create policy servicio_visitas_cliente_read on public.servicio_visitas
  for select to authenticated
  using (exists (
    select 1 from public.maquinas m
      join public.ubicaciones u on u.id = m.ubicacion_id
     where m.id = servicio_visitas.maquina_id
       and u.cliente_id = public.user_cliente_id()
  ));

-- El checklist respondido en esas visitas
create policy servicio_respuestas_cliente_read on public.servicio_respuestas
  for select to authenticated
  using (exists (
    select 1 from public.servicio_visitas v
      join public.maquinas m on m.id = v.maquina_id
      join public.ubicaciones u on u.id = m.ubicacion_id
     where v.id = servicio_respuestas.visita_id
       and u.cliente_id = public.user_cliente_id()
  ));

-- El check-in de esas visitas: hora de llegada, salida y geolocalización
create policy check_ins_cliente_read on public.check_ins
  for select to authenticated
  using (exists (
    select 1 from public.servicio_visitas v
      join public.maquinas m on m.id = v.maquina_id
      join public.ubicaciones u on u.id = m.ubicacion_id
     where v.check_in_id = check_ins.id
       and u.cliente_id = public.user_cliente_id()
  ));

-- La plantilla del checklist (catálogo, sin datos de negocio)
create policy checklist_plantillas_cliente_read on public.checklist_plantillas
  for select to authenticated
  using (public.user_cliente_id() is not null);

create policy checklist_items_cliente_read on public.checklist_items
  for select to authenticated
  using (public.user_cliente_id() is not null);

-- Solo el nombre del operador que atendió sus máquinas, y su propio perfil.
create policy profiles_cliente_read on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.servicio_visitas v
        join public.maquinas m on m.id = v.maquina_id
        join public.ubicaciones u on u.id = m.ubicacion_id
       where v.operador_id = profiles.id
         and u.cliente_id = public.user_cliente_id()
    )
  );

-- Sus propios roles (getCurrentUser los necesita para resolver el menú)
create policy user_roles_cliente_read on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());

-- ── 5. Storage: fotos y firmas de SUS visitas ────────────────────────────────
-- La policy vigente deja leer todo el bucket a cualquier autenticado; se acota
-- igual que las tablas.
drop policy if exists evidencias_servicio_select on storage.objects;
create policy evidencias_servicio_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias-servicio'
    and (
      public.user_es_interno()
      or exists (
        select 1
          from public.servicio_visitas v
          join public.maquinas m on m.id = v.maquina_id
          join public.ubicaciones u on u.id = m.ubicacion_id
         where u.cliente_id = public.user_cliente_id()
           and ('evidencias-servicio/' || storage.objects.name) in (
                 v.foto_general_url, v.firma_url
               )
      )
      or exists (
        select 1
          from public.servicio_respuestas r
          join public.servicio_visitas v on v.id = r.visita_id
          join public.maquinas m on m.id = v.maquina_id
          join public.ubicaciones u on u.id = m.ubicacion_id
         where u.cliente_id = public.user_cliente_id()
           and ('evidencias-servicio/' || storage.objects.name) = r.foto_url
      )
    )
  );
