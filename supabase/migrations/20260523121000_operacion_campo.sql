-- ============================================================================
-- 10 · Operación de campo
-- jornadas, check_ins, llenados, llenado_items, incidencias, devoluciones_almacen
-- (incidencias antes que devoluciones_almacen por FK)
-- ============================================================================

create table jornadas (
  id                       uuid primary key default gen_random_uuid(),
  asignacion_id            uuid not null unique references asignaciones_diarias(id) on delete restrict,
  operador_id              uuid not null references profiles(id) on delete restrict,
  hora_inicio              timestamptz not null default now(),
  lat_inicio               numeric(10,7),
  lng_inicio               numeric(10,7),
  hora_ultima_actividad    timestamptz,
  notas                    text,
  created_at               timestamptz not null default now()
);

create table check_ins (
  id                  uuid primary key default gen_random_uuid(),
  asignacion_id       uuid not null references asignaciones_diarias(id) on delete restrict,
  maquina_id          uuid not null references maquinas(id) on delete restrict,
  operador_id         uuid not null references profiles(id) on delete restrict,
  fecha_entrada       timestamptz not null default now(),
  fecha_salida        timestamptz,
  tiempo_en_sitio_seg int,
  lat                 numeric(10,7),
  lng                 numeric(10,7),
  precision_m         numeric(8,2),
  validado            boolean not null default false,
  metodo              checkin_metodo not null,
  motivo_manual       text,
  foto_evidencia_url  text,
  notas               text,
  created_at          timestamptz not null default now(),
  unique (asignacion_id, maquina_id)
);

create index check_ins_maquina_idx   on check_ins(maquina_id);
create index check_ins_operador_idx  on check_ins(operador_id);

create table llenados (
  id              uuid primary key default gen_random_uuid(),
  check_in_id     uuid not null unique references check_ins(id) on delete restrict,
  maquina_id      uuid not null references maquinas(id) on delete restrict,
  operador_id     uuid not null references profiles(id) on delete restrict,
  fecha           timestamptz not null default now(),
  evidencia_url   text,
  notas           text,
  created_at      timestamptz not null default now()
);

create table llenado_items (
  id                              uuid primary key default gen_random_uuid(),
  llenado_id                      uuid not null references llenados(id) on delete cascade,
  tolva_id                        uuid not null references tolvas(id) on delete restrict,
  surtido_item_id                 uuid not null references surtido_items(id) on delete restrict,
  cartuchos_planeados             int not null,
  cartuchos_cargados              int not null check (cartuchos_cargados >= 0),
  cartuchos_devolucion            int generated always as (cartuchos_planeados - cartuchos_cargados) stored,
  gramos_cargados                 int not null,
  encartuchado_id                 uuid not null references encartuchados(id) on delete restrict,
  inventario_tolva_antes          int,
  inventario_tolva_despues        int,
  costo_promedio_g_tolva_antes    numeric(12,6),
  costo_promedio_g_tolva_despues  numeric(12,6),
  notas                           text,
  created_at                      timestamptz not null default now()
);

create index llenado_items_llenado_idx on llenado_items(llenado_id);
create index llenado_items_tolva_idx   on llenado_items(tolva_id);

create table incidencias (
  id                            uuid primary key default gen_random_uuid(),
  folio                         text not null unique,
  tipo                          incidencia_tipo not null,
  severidad                     incidencia_severidad not null default 'media',
  maquina_id                    uuid references maquinas(id) on delete restrict,
  operador_id                   uuid references profiles(id),
  check_in_id                   uuid references check_ins(id) on delete restrict,
  descripcion                   text not null,
  foto_url                      text,
  estado                        incidencia_estado not null default 'abierta',
  requiere_autorizacion_merma   boolean not null default false,
  cartuchos_afectados           int,
  producto_afectado_id          uuid references productos(id) on delete restrict,
  encartuchado_afectado_id      uuid references encartuchados(id) on delete restrict,
  autorizada_por                uuid references profiles(id),
  fecha_autorizacion            timestamptz,
  fecha_apertura                timestamptz not null default now(),
  fecha_cierre                  timestamptz,
  notas_resolucion              text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index incidencias_estado_idx   on incidencias(estado);
create index incidencias_maquina_idx  on incidencias(maquina_id);

create table devoluciones_almacen (
  id                           uuid primary key default gen_random_uuid(),
  llenado_item_id              uuid not null unique references llenado_items(id) on delete restrict,
  operador_id                  uuid not null references profiles(id) on delete restrict,
  producto_id                  uuid not null references productos(id) on delete restrict,
  encartuchado_id              uuid not null references encartuchados(id) on delete restrict,
  cantidad_calculada           int not null,
  cantidad_recibida_almacen    int,
  estado                       devolucion_estado not null default 'pendiente_devolucion',
  recibida_por                 uuid references profiles(id),
  fecha_recepcion              timestamptz,
  incidencia_id                uuid references incidencias(id) on delete restrict,
  notas                        text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create index devoluciones_estado_idx on devoluciones_almacen(estado);
