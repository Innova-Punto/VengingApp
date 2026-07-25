-- 94 · Nuevo tipo de alerta para salidas de surtido duplicadas.
-- (ALTER TYPE ADD VALUE debe ir en su propia migración/commit antes de usarse.)
alter type public.alerta_tipo add value if not exists 'surtido_salida_duplicada';
