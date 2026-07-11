-- ============================================================================
-- 91a · Tipo de alerta: máquina sin vender 12 h
-- (ADD VALUE va en su propia migración; no puede usarse en la misma transacción
--  que lo agrega — la función que lo usa está en 20260708190000.)
-- ============================================================================

alter type public.alerta_tipo add value if not exists 'maquina_sin_venta_12h';
