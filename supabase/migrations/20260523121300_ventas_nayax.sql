-- ============================================================================
-- 13 · Ventas Nayax
-- nayax_sync_log, ventas_maquina  (sync_log antes para FK)
-- ============================================================================

create table nayax_sync_log (
  id                       uuid primary key default gen_random_uuid(),
  inicio                   timestamptz not null default now(),
  fin                      timestamptz,
  duracion_seg             int,
  cursor_desde             timestamptz,
  cursor_hasta             timestamptz,
  transacciones_jaladas    int not null default 0,
  transacciones_nuevas     int not null default 0,
  transacciones_duplicadas int not null default 0,
  errores                  int not null default 0,
  lag_minutos              int,
  estado                   text check (estado in ('exitoso','parcial','fallido')),
  mensaje_error            text,
  created_at               timestamptz not null default now()
);

create index nayax_sync_log_inicio_idx on nayax_sync_log(inicio desc);

create table ventas_maquina (
  id                          uuid primary key default gen_random_uuid(),
  nayax_transaction_id        text not null unique,
  maquina_id                  uuid not null references maquinas(id) on delete restrict,
  tolva_id                    uuid references tolvas(id) on delete restrict,
  producto_id                 uuid references productos(id) on delete restrict,
  cliente_id                  uuid references clientes(id) on delete restrict,
  fecha_transaccion           timestamptz not null,
  gramos_dispensados          int not null default 0,
  precio_bruto                numeric(10,2) not null default 0,
  comision_nayax_estimada     numeric(10,2) not null default 0,
  precio_neto                 numeric(10,2) not null default 0,
  costo_polvo                 numeric(10,2) not null default 0,
  costo_vaso                  numeric(10,2) not null default 0,
  utilidad_bruta              numeric(10,2) not null default 0,
  margen_porcentaje           numeric(6,2),
  metodo_pago                 text,
  ticket_id_nayax             text,
  cargado_at                  timestamptz not null default now(),
  sync_log_id                 uuid references nayax_sync_log(id) on delete restrict,
  cierre_id                   uuid references cierres_mensuales(id) on delete restrict,
  notas                       text
);

create index ventas_maquina_fecha_idx        on ventas_maquina(maquina_id, fecha_transaccion desc);
create index ventas_cliente_fecha_idx        on ventas_maquina(cliente_id, fecha_transaccion desc);
create index ventas_producto_fecha_idx       on ventas_maquina(producto_id, fecha_transaccion desc);
create index ventas_fecha_idx                on ventas_maquina(fecha_transaccion desc);
create index ventas_cierre_idx               on ventas_maquina(cierre_id);
