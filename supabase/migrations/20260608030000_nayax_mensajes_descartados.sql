-- ============================================================================
-- 66 · Archivo de mensajes Nayax descartados
--
-- Cuando un mensaje SQS llega con datos incompletos (típicamente productos
-- sin PA Code), antes era imposible procesarlo y se quedaba reciclando en la
-- cola, generando errores cada 2 min indefinidamente.
--
-- Ahora el poll guarda el payload crudo en esta tabla y borra el mensaje de
-- la cola. Permite auditar si esos mensajes eran ventas reales o solo eventos
-- de máquina.
-- ============================================================================

create table public.nayax_mensajes_descartados (
  id             uuid primary key default gen_random_uuid(),
  sqs_message_id text,
  transaction_id text,
  machine_id     text,
  motivo         text not null,
  payload        jsonb not null,
  created_at     timestamptz not null default now()
);

create index nayax_mensajes_descartados_motivo_idx
  on public.nayax_mensajes_descartados(motivo);
create index nayax_mensajes_descartados_created_idx
  on public.nayax_mensajes_descartados(created_at desc);

alter table public.nayax_mensajes_descartados enable row level security;

create policy "nayax_descartados_admin_select" on public.nayax_mensajes_descartados
  for select to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role));
