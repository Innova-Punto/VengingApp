-- ============================================================================
-- 15 · Calibración de máquinas
-- calibraciones_maquina
-- ============================================================================

create table calibraciones_maquina (
  id                            uuid primary key default gen_random_uuid(),
  maquina_id                    uuid not null references maquinas(id) on delete restrict,
  tolva_id                      uuid references tolvas(id) on delete restrict,
  fecha                         timestamptz not null default now(),
  tipo                          calibracion_tipo not null,
  tecnico_id                    uuid not null references profiles(id) on delete restrict,
  gramaje_esperado              int not null,
  gramaje_medido_1              int not null,
  gramaje_medido_2              int not null,
  gramaje_medido_3              int not null,
  gramaje_promedio              numeric(8,2) generated always as ((gramaje_medido_1 + gramaje_medido_2 + gramaje_medido_3) / 3.0) stored,
  desviacion_porcentaje         numeric(6,2),
  ajuste_aplicado               boolean not null default false,
  descripcion_ajuste            text,
  alerta_origen_id              uuid references alertas(id) on delete restrict,
  incidencia_origen_id          uuid references incidencias(id) on delete restrict,
  proxima_calibracion_sugerida  date,
  foto_url                      text,
  notas                         text,
  created_at                    timestamptz not null default now()
);

create index calibraciones_maquina_fecha_idx on calibraciones_maquina(maquina_id, fecha desc);
