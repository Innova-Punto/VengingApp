-- ============================================================================
-- 'agua' como tercer tipo de insumo, junto a 'polvo' y 'vaso'.
--
-- Va sola en su propia migración a propósito: Postgres no permite usar un valor
-- de enum en la misma transacción en la que se agrega. La migración que sigue
-- (20260906120100_modulo_agua.sql) ya puede darlo de alta como producto.
-- ============================================================================

alter type public.producto_tipo add value if not exists 'agua';
