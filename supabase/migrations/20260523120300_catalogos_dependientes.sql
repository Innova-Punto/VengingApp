-- ============================================================================
-- 03 · Catálogos con FK
-- presentaciones_proveedor, ubicaciones, maquinas, tolvas, planograma_historico
-- ============================================================================

create table presentaciones_proveedor (
  id                         uuid primary key default gen_random_uuid(),
  producto_id                uuid not null references productos(id) on delete restrict,
  proveedor_id               uuid not null references proveedores(id) on delete restrict,
  nombre_presentacion        text not null,
  peso_neto_gramos           int not null check (peso_neto_gramos > 0),
  unidades_por_presentacion  int not null default 1,
  costo_unitario             numeric(12,2) not null,
  moneda                     text not null default 'MXN',
  sku_proveedor              text,
  activo                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (producto_id, proveedor_id, nombre_presentacion)
);

create index presentaciones_producto_idx  on presentaciones_proveedor(producto_id);
create index presentaciones_proveedor_idx on presentaciones_proveedor(proveedor_id);

create table ubicaciones (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references clientes(id) on delete restrict,
  nombre             text not null,
  direccion          text,
  colonia            text,
  ciudad             text,
  estado             text,
  cp                 text,
  lat                numeric(10,7),
  lng                numeric(10,7),
  radio_geofence_m   int not null default 100,
  horario_apertura   time,
  horario_cierre     time,
  notas              text,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index ubicaciones_cliente_idx on ubicaciones(cliente_id);

create table maquinas (
  id                          uuid primary key default gen_random_uuid(),
  serie                       text not null unique,
  alias                       text,
  ubicacion_id                uuid not null references ubicaciones(id) on delete restrict,
  modelo                      text,
  num_tolvas                  int not null default 8 check (num_tolvas between 1 and 8),
  capacidad_max_tolva_g       int not null default 2000,
  nayax_machine_id            text unique,
  nayax_serial                text,
  frecuencia_visita_dias      int not null default 7,
  qr_codigo                   text unique,
  proxima_calibracion_fecha   date,
  estado                      maquina_estado not null default 'operativa',
  fecha_instalacion           date,
  notas                       text,
  activo                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index maquinas_ubicacion_idx on maquinas(ubicacion_id);
create index maquinas_estado_idx    on maquinas(estado);

create table tolvas (
  id                         uuid primary key default gen_random_uuid(),
  maquina_id                 uuid not null references maquinas(id) on delete cascade,
  numero                     int not null check (numero between 1 and 8),
  producto_id                uuid references productos(id) on delete restrict,
  gramaje_servicio           int,
  precio_venta               numeric(10,2),
  nayax_item_code            text,
  capacidad_max_g            int not null default 2000,
  inventario_actual_g        int not null default 0,
  costo_promedio_g_actual    numeric(12,6) not null default 0,
  ultimo_llenado_at          timestamptz,
  ultimo_pesaje_at           timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (maquina_id, numero)
);

create index tolvas_producto_idx on tolvas(producto_id);

create table planograma_historico (
  id                uuid primary key default gen_random_uuid(),
  maquina_id        uuid not null references maquinas(id) on delete restrict,
  tolva_numero      int not null check (tolva_numero between 1 and 8),
  producto_id       uuid not null references productos(id) on delete restrict,
  gramaje_servicio  int not null,
  precio_venta      numeric(10,2) not null,
  nayax_item_code   text,
  vigente_desde     timestamptz not null,
  vigente_hasta     timestamptz,
  motivo_cambio     text,
  creado_por        uuid references profiles(id),
  created_at        timestamptz not null default now()
);

create index planograma_maquina_tolva_idx on planograma_historico(maquina_id, tolva_numero);
create index planograma_vigente_idx       on planograma_historico(maquina_id) where vigente_hasta is null;
