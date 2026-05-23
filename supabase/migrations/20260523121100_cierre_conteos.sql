-- ============================================================================
-- 11 · Cierre mensual y conteos
-- cierres_mensuales, pesajes_maquina, pesaje_tolva_items,
-- conteos_almacen, conteo_granel_items, conteo_cartuchos_items
-- ============================================================================

create table cierres_mensuales (
  id                          uuid primary key default gen_random_uuid(),
  periodo_mes                 int not null check (periodo_mes between 1 and 12),
  periodo_anio                int not null,
  estado                      cierre_estado not null default 'abierto',
  fecha_inicio_cierre         timestamptz,
  fecha_cierre                timestamptz,
  cerrado_por                 uuid references profiles(id),
  total_maquinas_periodo      int,
  maquinas_pesadas            int not null default 0,
  conteo_almacen_completado   boolean not null default false,
  notas                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (periodo_mes, periodo_anio)
);

create table pesajes_maquina (
  id           uuid primary key default gen_random_uuid(),
  cierre_id    uuid not null references cierres_mensuales(id) on delete restrict,
  maquina_id   uuid not null references maquinas(id) on delete restrict,
  check_in_id  uuid not null references check_ins(id) on delete restrict,
  operador_id  uuid not null references profiles(id) on delete restrict,
  fecha        timestamptz not null default now(),
  notas        text,
  created_at   timestamptz not null default now(),
  unique (cierre_id, maquina_id)
);

create table pesaje_tolva_items (
  id                      uuid primary key default gen_random_uuid(),
  pesaje_id               uuid not null references pesajes_maquina(id) on delete cascade,
  tolva_id                uuid not null references tolvas(id) on delete restrict,
  gramos_medidos          int not null check (gramos_medidos >= 0),
  gramos_teoricos         int not null,
  diferencia_gramos       int generated always as (gramos_medidos - gramos_teoricos) stored,
  diferencia_porcentaje   numeric(6,2),
  valor_diferencia        numeric(14,2),
  foto_url                text,
  alerta_generada         boolean not null default false,
  notas                   text,
  created_at              timestamptz not null default now()
);

create index pesaje_tolva_items_pesaje_idx on pesaje_tolva_items(pesaje_id);

create table conteos_almacen (
  id             uuid primary key default gen_random_uuid(),
  cierre_id      uuid not null unique references cierres_mensuales(id) on delete restrict,
  fecha          timestamptz not null default now(),
  realizado_por  uuid not null references profiles(id) on delete restrict,
  supervisor_id  uuid references profiles(id),
  estado         text not null default 'en_proceso' check (estado in ('en_proceso','completado')),
  notas          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table conteo_granel_items (
  id                uuid primary key default gen_random_uuid(),
  conteo_id         uuid not null references conteos_almacen(id) on delete cascade,
  lote_id           uuid not null references lotes(id) on delete restrict,
  gramos_sistema    int not null,
  gramos_fisicos    int not null check (gramos_fisicos >= 0),
  diferencia        int generated always as (gramos_fisicos - gramos_sistema) stored,
  valor_diferencia  numeric(14,2),
  notas             text,
  created_at        timestamptz not null default now(),
  unique (conteo_id, lote_id)
);

create table conteo_cartuchos_items (
  id                uuid primary key default gen_random_uuid(),
  conteo_id         uuid not null references conteos_almacen(id) on delete cascade,
  producto_id       uuid not null references productos(id) on delete restrict,
  encartuchado_id   uuid not null references encartuchados(id) on delete restrict,
  cantidad_sistema  int not null,
  cantidad_fisica   int not null check (cantidad_fisica >= 0),
  diferencia        int generated always as (cantidad_fisica - cantidad_sistema) stored,
  valor_diferencia  numeric(14,2),
  notas             text,
  created_at        timestamptz not null default now(),
  unique (conteo_id, producto_id, encartuchado_id)
);
