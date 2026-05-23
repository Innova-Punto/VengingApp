-- ============================================================================
-- 05 · Rutas y asignaciones
-- rutas, ruta_maquinas, asignaciones_diarias, asignacion_maquinas
-- ============================================================================

create table rutas (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null unique,
  descripcion          text,
  operador_titular_id  uuid references profiles(id),
  color_hex            text,
  activa               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table ruta_maquinas (
  ruta_id     uuid not null references rutas(id) on delete cascade,
  maquina_id  uuid not null references maquinas(id) on delete cascade,
  orden       int not null default 0,
  created_at  timestamptz not null default now(),
  primary key (ruta_id, maquina_id),
  unique (maquina_id) -- una máquina solo pertenece a una ruta base
);

create table asignaciones_diarias (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  ruta_id      uuid not null references rutas(id) on delete restrict,
  operador_id  uuid not null references profiles(id) on delete restrict,
  estado       asignacion_estado not null default 'planeada',
  notas        text,
  creado_por   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (fecha, ruta_id)
);

create index asignaciones_fecha_idx    on asignaciones_diarias(fecha);
create index asignaciones_operador_idx on asignaciones_diarias(operador_id);

create table asignacion_maquinas (
  id                 uuid primary key default gen_random_uuid(),
  asignacion_id      uuid not null references asignaciones_diarias(id) on delete cascade,
  maquina_id         uuid not null references maquinas(id) on delete restrict,
  orden              int not null default 0,
  origen             text not null check (origen in ('base_ruta','agregada_excepcion')),
  motivo_excepcion   excepcion_motivo,
  notas              text,
  created_at         timestamptz not null default now(),
  unique (asignacion_id, maquina_id)
);
