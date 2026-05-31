-- ============================================================================
-- 42 · Nuevos tipos de incidencia: vaso_atorado y falta_de_agua
-- ============================================================================

alter type public.incidencia_tipo add value if not exists 'vaso_atorado';
alter type public.incidencia_tipo add value if not exists 'falta_de_agua';
