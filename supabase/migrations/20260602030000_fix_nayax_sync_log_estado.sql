-- ============================================================================
-- 50 · Alinea CHECK estado de nayax_sync_log con los valores reales
--
-- La tabla nayax_sync_log se creó con CHECK ('exitoso','parcial','fallido')
-- pero las RPCs iniciar_sync_log_nayax / cerrar_sync_log_nayax meten
-- ('en_proceso','ok','con_errores') y la UI los lee así.
-- El insert siempre tronaba con check constraint violation, por eso el
-- cron de SQS devolvía 500 sin poder crear logs.
-- ============================================================================

alter table public.nayax_sync_log
  drop constraint if exists nayax_sync_log_estado_check;

alter table public.nayax_sync_log
  add constraint nayax_sync_log_estado_check
  check (estado in ('en_proceso', 'ok', 'con_errores'));
