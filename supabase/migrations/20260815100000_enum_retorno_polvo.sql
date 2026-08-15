-- ============================================================================
-- 105 · Nuevo tipo de movimiento: retorno_polvo_tolva
--
-- Va en su propia migración porque PostgreSQL exige que el valor nuevo de un
-- enum esté commiteado antes de poder usarse. La lógica que lo consume vive en
-- la migración siguiente (20260815100001_sustitucion_producto_tolva.sql).
--
-- Describe el polvo que se retira físicamente de una tolva al sustituir un
-- producto por otro. NO es merma ni ajuste de conteo: el polvo se recupera y
-- regresa a almacén en un lote propio, en cuarentena hasta que se inspeccione.
-- ============================================================================

alter type public.movimiento_tipo add value if not exists 'retorno_polvo_tolva';
