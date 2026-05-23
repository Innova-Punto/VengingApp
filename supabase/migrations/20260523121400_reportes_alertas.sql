-- ============================================================================
-- 14 · Reportes y alertas (antes de calibracion porque calibraciones_maquina ref alertas)
-- reportes_cliente, alertas
-- ============================================================================

create table reportes_cliente (
  id                     uuid primary key default gen_random_uuid(),
  cliente_id             uuid not null references clientes(id) on delete restrict,
  periodo_mes            int not null check (periodo_mes between 1 and 12),
  periodo_anio           int not null,
  cierre_id              uuid not null references cierres_mensuales(id) on delete restrict,
  estado                 reporte_estado not null default 'en_generacion',
  fecha_generacion       timestamptz,
  fecha_envio            timestamptz,
  archivo_pdf_url        text,
  archivo_csv_url        text,
  enviado_a              text[],
  total_consumo_g        int,
  total_shakes           int,
  total_ventas_brutas    numeric(14,2),
  total_ventas_netas     numeric(14,2),
  comision_cliente       numeric(14,2),
  aprobado_por           uuid references profiles(id),
  notas                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (cliente_id, periodo_mes, periodo_anio)
);

create table alertas (
  id                 uuid primary key default gen_random_uuid(),
  tipo               alerta_tipo not null,
  severidad          alerta_severidad not null default 'warning',
  maquina_id         uuid references maquinas(id) on delete restrict,
  tolva_id           uuid references tolvas(id) on delete restrict,
  mensaje            text not null,
  datos_jsonb        jsonb,
  notificada_a       uuid[],
  canales_envio      text[],
  estado             alerta_estado not null default 'activa',
  fecha_apertura     timestamptz not null default now(),
  fecha_cierre       timestamptz,
  atendida_por       uuid references profiles(id),
  notas_resolucion   text,
  created_at         timestamptz not null default now()
);

create index alertas_estado_idx  on alertas(estado);
create index alertas_maquina_idx on alertas(maquina_id);
