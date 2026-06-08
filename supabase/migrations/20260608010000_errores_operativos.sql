-- ============================================================================
-- 64 · Errores operativos
--
-- Tabla para que admin/dirección levante errores observados en una jornada
-- (Omisión en carga, llegada tarde, máquina en error post-visita, etc).
-- Distinta de `incidencias`: aquellas las reporta el operador desde campo;
-- estos errores los levanta el supervisor desde la auditoría.
-- ============================================================================

create type public.error_op_motivo as enum (
  'omision_carga',
  'omision_llenado',
  'no_registro_visita',
  'llegada_tarde',
  'carga_destiempo',
  'maquina_error_post_visita'
);

create type public.error_op_estado as enum (
  'abierto',
  'resuelto',
  'descartado'
);

create table public.errores_operativos (
  id              uuid primary key default gen_random_uuid(),
  motivo          public.error_op_motivo not null,
  descripcion     text,
  estado          public.error_op_estado not null default 'abierto',
  fecha           timestamptz not null default now(),

  -- Referencias opcionales (el error puede no estar atado a una jornada
  -- específica, por ejemplo si reportas algo de una ruta o un operador
  -- sin asignación previa).
  ruta_id         uuid references public.rutas(id) on delete set null,
  operador_id     uuid not null references public.profiles(id) on delete restrict,
  asignacion_id   uuid references public.asignaciones_diarias(id) on delete set null,
  maquina_id      uuid references public.maquinas(id) on delete set null,

  levantado_por   uuid not null references public.profiles(id) on delete restrict,
  resuelto_por    uuid references public.profiles(id) on delete set null,
  resuelto_at     timestamptz,
  nota_resolucion text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index errores_operativos_operador_idx on public.errores_operativos(operador_id);
create index errores_operativos_asignacion_idx on public.errores_operativos(asignacion_id);
create index errores_operativos_ruta_idx on public.errores_operativos(ruta_id);
create index errores_operativos_fecha_idx on public.errores_operativos(fecha desc);
create index errores_operativos_estado_idx on public.errores_operativos(estado);
create index errores_operativos_motivo_idx on public.errores_operativos(motivo);

create trigger trg_errores_operativos_updated_at
  before update on public.errores_operativos
  for each row execute function public.set_updated_at();

alter table public.errores_operativos enable row level security;

-- admin/dirección: acceso total
create policy "errores_op_admin_all" on public.errores_operativos
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role));

-- operador: solo ve los suyos (read-only)
create policy "errores_op_operador_select_propios" on public.errores_operativos
  for select to authenticated
  using (operador_id = auth.uid());
