-- ============================================================================
-- Rol 'cliente': acceso de solo lectura para el personal del cliente.
--
-- Va en su propia migración porque Postgres exige que un valor de enum esté
-- commiteado antes de poder usarse (mismo caso que 'retorno_polvo_tolva').
-- ============================================================================

alter type public.app_role add value if not exists 'cliente';
