-- ============================================================================
-- 02 · Catálogos base (sin FK a otras tablas de catálogo)
-- proveedores, clientes, productos
-- ============================================================================

create table proveedores (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,
  rfc             text,
  razon_social    text,
  contacto_nombre text,
  contacto_email  text,
  contacto_tel    text,
  dias_credito    int not null default 0,
  notas           text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table clientes (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,
  razon_social    text,
  rfc             text,
  contacto_nombre text,
  contacto_email  text,
  contacto_tel    text,
  emails_reporte  text[],
  notas           text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table productos (
  id                         uuid primary key default gen_random_uuid(),
  sku                        text not null unique,
  nombre                     text not null,
  tipo                       producto_tipo not null,
  marca                      text,
  sabor                      text,
  categoria                  text,
  cliente_exclusivo_id       uuid references clientes(id) on delete restrict,
  gramaje_cartucho_default   int not null default 400,
  gramaje_servicio_default   int,
  precio_venta_default       numeric(10,2),
  unidad_medida              text not null default 'gramos',
  notas                      text,
  activo                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index productos_tipo_idx              on productos(tipo);
create index productos_cliente_exclusivo_idx on productos(cliente_exclusivo_id);
