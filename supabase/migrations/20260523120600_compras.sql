-- ============================================================================
-- 06 · Compras
-- ordenes_compra, oc_items
-- ============================================================================

create table ordenes_compra (
  id                  uuid primary key default gen_random_uuid(),
  folio               text not null unique,
  proveedor_id        uuid not null references proveedores(id) on delete restrict,
  fecha_emision       date not null default current_date,
  fecha_esperada      date,
  estado              oc_estado not null default 'borrador',
  subtotal            numeric(14,2) not null default 0,
  iva                 numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  moneda              text not null default 'MXN',
  notas               text,
  creado_por          uuid references profiles(id),
  aprobado_por        uuid references profiles(id),
  fecha_aprobacion    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index ordenes_compra_proveedor_idx on ordenes_compra(proveedor_id);
create index ordenes_compra_estado_idx    on ordenes_compra(estado);
create index ordenes_compra_fecha_idx     on ordenes_compra(fecha_emision desc);

create table oc_items (
  id                uuid primary key default gen_random_uuid(),
  oc_id             uuid not null references ordenes_compra(id) on delete cascade,
  presentacion_id   uuid not null references presentaciones_proveedor(id) on delete restrict,
  cantidad          int not null check (cantidad > 0),
  costo_unitario    numeric(12,2) not null,
  subtotal_item     numeric(14,2) not null,
  recibido          int not null default 0,
  notas             text,
  created_at        timestamptz not null default now()
);

create index oc_items_oc_idx            on oc_items(oc_id);
create index oc_items_presentacion_idx  on oc_items(presentacion_id);
