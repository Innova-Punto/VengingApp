-- ============================================================================
-- 04 · Configuración y contratos
-- config_global, contratos_cliente
-- ============================================================================

create table config_global (
  id              uuid primary key default gen_random_uuid(),
  clave           text not null,
  valor           text not null,
  tipo_dato       text not null check (tipo_dato in ('numero','texto','booleano','json')),
  descripcion     text,
  vigente_desde   timestamptz not null default now(),
  vigente_hasta   timestamptz,
  actualizado_por uuid references profiles(id),
  created_at      timestamptz not null default now()
);

-- Solo un registro vigente por clave
create unique index config_global_clave_vigente_uniq
  on config_global(clave)
  where vigente_hasta is null;

create index config_global_clave_idx on config_global(clave);

create table contratos_cliente (
  id                         uuid primary key default gen_random_uuid(),
  cliente_id                 uuid not null references clientes(id) on delete restrict,
  tipo                       contrato_tipo not null,
  porcentaje_revenue_share   numeric(5,2),
  base_calculo               text check (base_calculo in ('venta_bruta','venta_neta_sin_nayax')),
  renta_mensual_fija         numeric(14,2),
  vigente_desde              date not null,
  vigente_hasta              date,
  notas                      text,
  creado_por                 uuid references profiles(id),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index contratos_cliente_cliente_idx on contratos_cliente(cliente_id);
create unique index contratos_cliente_vigente_uniq
  on contratos_cliente(cliente_id)
  where vigente_hasta is null;
