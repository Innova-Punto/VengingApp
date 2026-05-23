-- ============================================================================
-- 09 · Surtido
-- surtidos, surtido_items
-- ============================================================================

create table surtidos (
  id                 uuid primary key default gen_random_uuid(),
  folio              text not null unique,
  asignacion_id      uuid not null unique references asignaciones_diarias(id) on delete restrict,
  fecha              timestamptz not null default now(),
  estado             surtido_estado not null default 'pendiente',
  creado_por         uuid references profiles(id),
  surtido_por        uuid references profiles(id),
  fecha_completado   timestamptz,
  notas              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table surtido_items (
  id                      uuid primary key default gen_random_uuid(),
  surtido_id              uuid not null references surtidos(id) on delete cascade,
  maquina_id              uuid not null references maquinas(id) on delete restrict,
  producto_id             uuid not null references productos(id) on delete restrict,
  cartuchos_sugeridos     int not null default 0,
  cartuchos_entregados    int not null default 0,
  encartuchado_id         uuid references encartuchados(id) on delete restrict,
  vasos_sugeridos         int not null default 0,
  vasos_entregados        int not null default 0,
  lote_vaso_id            uuid references lotes(id) on delete restrict,
  notas                   text,
  created_at              timestamptz not null default now()
);

create index surtido_items_surtido_idx   on surtido_items(surtido_id);
create index surtido_items_maquina_idx   on surtido_items(maquina_id);
