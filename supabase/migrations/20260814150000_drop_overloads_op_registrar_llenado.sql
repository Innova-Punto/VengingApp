-- ============================================================================
-- 103 · Deuda técnica: elimina los overloads viejos de op_registrar_llenado
--
-- Problema: convivían 3 firmas de la misma función porque cada feature agregó
-- parámetros con un `create or replace` que en realidad creaba una función
-- NUEVA (cambiar la lista de parámetros crea otra función, no reemplaza):
--
--   1) (uuid, jsonb, text, text)                                  ← original
--   2) (uuid, jsonb, text, text, int)                             ← + vasos
--   3) (uuid, jsonb, text, text, int, text, bool, bool, bool)     ← + checkout  ✅ vigente
--
-- Riesgo real: PostgREST resuelve el overload por los parámetros NOMBRADOS que
-- recibe. Una llamada a la que le falte un parámetro (por un bug de UI, una
-- versión vieja del cliente en caché, o un `undefined` que se serializa fuera
-- del body) resuelve silenciosamente a la firma 1 o 2. Consecuencia: la visita
-- se cierra SIN los datos de checkout (foto de salida, Nayax activo, máquina
-- limpia, productos activos) y sin vasos, y nadie se entera porque no hay error.
--
-- Es exactamente el patrón que ya causó el bug de `abrir_cierre_mensual`
-- (donde pasar p_force elegía la firma vieja y rompía el cierre encadenado).
--
-- Solución: dejar SOLO la firma vigente de 9 parámetros. La app la llama con
-- los 9 nombrados (src/app/campo/maquinas/[id]/actions.ts).
-- ============================================================================

drop function if exists public.op_registrar_llenado(uuid, jsonb, text, text);
drop function if exists public.op_registrar_llenado(uuid, jsonb, text, text, int);

comment on function public.op_registrar_llenado(uuid, jsonb, text, text, int, text, boolean, boolean, boolean) is
  'Registra el llenado de una máquina y cierra el check-in con los datos de checkout. '
  'FIRMA ÚNICA: no crear overloads — PostgREST resuelve por parámetros nombrados y una '
  'llamada incompleta caería en la firma equivocada. Si hace falta un parámetro nuevo, '
  'agrégalo con DEFAULT y dropea la firma anterior en la misma migración.';
