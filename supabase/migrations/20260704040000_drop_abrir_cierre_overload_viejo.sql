-- ============================================================================
-- 86 · Elimina el overload viejo de abrir_cierre_mensual(int, int, boolean)
--
-- Coexistían dos versiones:
--   * abrir_cierre_mensual(int, int)          → modelo encadenado (inicial =
--     final del cierre anterior) + siembra cierre_snapshot_producto 'inicio'.
--   * abrir_cierre_mensual(int, int, boolean) → versión vieja de bootstrap,
--     sin encadenado, sin snapshot por producto, sin arrastre de vasos.
--
-- El front llamaba con p_force, lo que seleccionaba SIEMPRE el overload viejo,
-- así que al abrir un mes nuevo el modelo encadenado nunca corría (inicial de
-- vasos = 0, sin snapshot por producto → bloques por cliente en cero).
--
-- La versión nueva es idempotente (si el mes ya existe lo devuelve) y ya no
-- necesita p_force. Eliminamos el overload viejo para que no vuelva a elegirse.
-- ============================================================================

drop function if exists public.abrir_cierre_mensual(integer, integer, boolean);
