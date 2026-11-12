-- ============================================================================
-- 157 · Una asignación cancelada deja de apartar el lugar
--
-- El error que vio Mariana hoy:
--
--   "La ruta RUTA CENTRO ya tiene asignación el 2026-11-12. Cancélala primero."
--
-- Y ya estaba cancelada. Ésa era justo la que bloqueaba.
--
-- `asignaciones_diarias` tenía `unique (fecha, ruta_id)` sin condición, así que
-- una asignación cancelada seguía ocupando el par ruta+día para siempre. Una
-- vez que cancelas la ruta del día, esa ruta queda inutilizable hasta mañana:
-- ni el agente, ni la ruta dinámica, ni la captura manual pueden volver a
-- usarla. Y el mensaje mandaba a hacer exactamente lo que ya se había hecho.
--
-- Cancelar algo debe liberar el lugar; para eso se cancela. El índice pasa a
-- ser parcial: sigue impidiendo dos asignaciones **vigentes** de la misma ruta
-- el mismo día —que sí sería mandar a dos personas al mismo lado— y deja de
-- contar las canceladas.
--
-- Nota sobre `ruta_id` nulo: las asignaciones de emergencia no traen ruta, y en
-- un índice único los nulos no chocan entre sí. Hoy hay 11 días con dos o tres
-- de ésas conviviendo y así debe seguir. El índice parcial se comporta igual.
-- ============================================================================

alter table public.asignaciones_diarias
  drop constraint if exists asignaciones_diarias_fecha_ruta_id_key;

create unique index if not exists asignaciones_diarias_fecha_ruta_vigente_idx
  on public.asignaciones_diarias (fecha, ruta_id)
  where estado <> 'cancelada';

comment on index public.asignaciones_diarias_fecha_ruta_vigente_idx is
  'Una ruta no puede tener dos asignaciones vigentes el mismo día. Las canceladas no cuentan: cancelar libera el lugar. Ver migración 20261112000000.';
