-- ============================================================================
-- 08 · Encartuchado
-- encartuchados, encartuchado_lotes
-- ============================================================================

create table encartuchados (
  id                          uuid primary key default gen_random_uuid(),
  folio                       text not null unique,
  producto_id                 uuid not null references productos(id) on delete restrict,
  fecha                       timestamptz not null default now(),
  cartuchos_producidos        int not null check (cartuchos_producidos > 0),
  gramos_por_cartucho         int not null default 400,
  gramos_totales_consumidos   int not null,
  gramos_merma                int not null default 0,
  costo_promedio_g            numeric(12,6) not null,
  cantidad_disponible         int not null,
  operario_id                 uuid references profiles(id),
  notas                       text,
  created_at                  timestamptz not null default now()
);

create index encartuchados_producto_fecha_idx on encartuchados(producto_id, fecha);
create index encartuchados_disponibles_idx    on encartuchados(producto_id) where cantidad_disponible > 0;

create table encartuchado_lotes (
  id                     uuid primary key default gen_random_uuid(),
  encartuchado_id        uuid not null references encartuchados(id) on delete cascade,
  lote_id                uuid not null references lotes(id) on delete restrict,
  gramos_consumidos      int not null check (gramos_consumidos > 0),
  costo_por_gramo_lote   numeric(12,6) not null,
  valor_aportado         numeric(14,2) not null,
  created_at             timestamptz not null default now(),
  unique (encartuchado_id, lote_id)
);
