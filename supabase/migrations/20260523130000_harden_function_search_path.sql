-- ============================================================================
-- 18 · Hardening de search_path en funciones helpers
-- Resuelve advisor function_search_path_mutable (lint 0011)
-- ============================================================================

alter function public.set_updated_at()        set search_path = '';
alter function public.gen_folio(text, text)   set search_path = '';
alter function public.set_folio_oc()          set search_path = public, pg_temp;
alter function public.set_folio_rec()         set search_path = public, pg_temp;
alter function public.set_folio_enc()         set search_path = public, pg_temp;
alter function public.set_folio_sur()         set search_path = public, pg_temp;
alter function public.set_folio_inc()         set search_path = public, pg_temp;

-- Nota: public.user_has_role mantiene EXECUTE para authenticated porque las
-- policies RLS necesitan invocarla durante la evaluación de visibilidad.
-- El advisor 0029 (security_definer_function_executable) queda como WARN
-- aceptado: aunque la función sea expuesta vía /rest/v1/rpc, sólo devuelve
-- boolean según el rol del usuario actual.
