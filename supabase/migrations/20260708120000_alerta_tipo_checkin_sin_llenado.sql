-- ============================================================================
-- 87 · Nuevos tipos de alerta para el cierre automático de fin de día
--
-- checkin_sin_llenado : máquina con check-in pero SIN llenado registrado, que
--   el cron cerró a la fuerza → requiere reconciliación manual (carga/devolución).
-- maquina_no_visitada : máquina del surtido que nunca se visitó; su surtido se
--   devolvió automáticamente al almacén (visibilidad, no acción).
--
-- Nota: ADD VALUE debe ir en su propia migración (no puede usarse el valor nuevo
-- en la misma transacción que lo agrega).
-- ============================================================================

alter type public.alerta_tipo add value if not exists 'checkin_sin_llenado';
alter type public.alerta_tipo add value if not exists 'maquina_no_visitada';
