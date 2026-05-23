-- ============================================================================
-- 12 · Kardex (movimientos de inventario)
-- movimientos_inventario — append-only
-- ============================================================================

create table movimientos_inventario (
  id                         uuid primary key default gen_random_uuid(),
  fecha                      timestamptz not null default now(),
  tipo                       movimiento_tipo not null,
  producto_id                uuid not null references productos(id) on delete restrict,
  lote_id                    uuid references lotes(id) on delete restrict,
  encartuchado_id            uuid references encartuchados(id) on delete restrict,
  maquina_id                 uuid references maquinas(id) on delete restrict,
  tolva_id                   uuid references tolvas(id) on delete restrict,
  cliente_id                 uuid references clientes(id) on delete restrict,
  presentacion               mov_presentacion not null,
  gramos                     int not null default 0,
  cantidad_cartuchos         int not null default 0,
  cantidad_vasos             int not null default 0,
  costo_por_gramo_snapshot   numeric(12,6) not null default 0,
  valor_movimiento           numeric(14,2) not null default 0,
  referencia_tabla           text not null,
  referencia_id              uuid not null,
  usuario_id                 uuid references profiles(id),
  cierre_id                  uuid references cierres_mensuales(id) on delete restrict,
  notas                      text,
  created_at                 timestamptz not null default now()
);

create index movimientos_fecha_idx           on movimientos_inventario(fecha desc);
create index movimientos_producto_fecha_idx  on movimientos_inventario(producto_id, fecha desc);
create index movimientos_maquina_fecha_idx   on movimientos_inventario(maquina_id, fecha desc);
create index movimientos_cliente_fecha_idx   on movimientos_inventario(cliente_id, fecha desc);
create index movimientos_lote_fecha_idx      on movimientos_inventario(lote_id, fecha desc);
create index movimientos_encartuchado_idx    on movimientos_inventario(encartuchado_id, fecha desc);
create index movimientos_cierre_idx          on movimientos_inventario(cierre_id);
create index movimientos_ref_idx             on movimientos_inventario(referencia_tabla, referencia_id);
