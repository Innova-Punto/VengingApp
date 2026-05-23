-- ============================================================================
-- 07 · Recepción y lotes
-- recepciones, lotes, recepcion_items
-- ============================================================================

create table recepciones (
  id                  uuid primary key default gen_random_uuid(),
  folio               text not null unique,
  oc_id               uuid not null references ordenes_compra(id) on delete restrict,
  fecha               date not null default current_date,
  recibido_por        uuid not null references profiles(id) on delete restrict,
  factura_proveedor   text,
  notas               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index recepciones_oc_idx    on recepciones(oc_id);
create index recepciones_fecha_idx on recepciones(fecha desc);

create table lotes (
  id                          uuid primary key default gen_random_uuid(),
  codigo_lote                 text not null unique,
  producto_id                 uuid not null references productos(id) on delete restrict,
  proveedor_id                uuid not null references proveedores(id) on delete restrict,
  presentacion_id             uuid references presentaciones_proveedor(id) on delete restrict,
  recepcion_id                uuid not null references recepciones(id) on delete restrict,
  fecha_recepcion             date not null default current_date,
  fecha_caducidad             date,
  gramos_iniciales            int not null check (gramos_iniciales >= 0),
  gramos_disponibles_granel   int not null default 0,
  costo_por_gramo             numeric(12,6) not null,
  unidades_iniciales          int,
  unidades_disponibles        int,
  notas                       text,
  activo                      boolean not null default true,
  created_at                  timestamptz not null default now()
);

create index lotes_producto_fecha_idx on lotes(producto_id, fecha_recepcion);
create index lotes_recepcion_idx      on lotes(recepcion_id);

create table recepcion_items (
  id                        uuid primary key default gen_random_uuid(),
  recepcion_id              uuid not null references recepciones(id) on delete cascade,
  oc_item_id                uuid not null references oc_items(id) on delete restrict,
  lote_id                   uuid not null references lotes(id) on delete restrict,
  presentaciones_recibidas  int not null check (presentaciones_recibidas > 0),
  peso_total_gramos         int not null default 0,
  unidades_totales          int,
  notas                     text,
  created_at                timestamptz not null default now()
);

create index recepcion_items_recepcion_idx on recepcion_items(recepcion_id);
create index recepcion_items_lote_idx      on recepcion_items(lote_id);
