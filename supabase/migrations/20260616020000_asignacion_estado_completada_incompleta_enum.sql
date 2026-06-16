-- Agrega valor de enum (debe ir en migración separada porque Postgres
-- no permite usar un enum value recién creado en la misma transacción).
alter type public.asignacion_estado add value if not exists 'completada_incompleta';
