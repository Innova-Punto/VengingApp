-- ============================================================================
-- 47 · Cache de token Lynx (Nayax)
--
-- Lynx tiene un límite de 10 tokens concurrentes por usuario. Si pedimos
-- token nuevo en cada server action, llegamos al límite rápidamente. Esta
-- tabla almacena el token actual con su expiración para reutilizarlo entre
-- invocaciones (es serverless, no podemos cachear en memoria).
-- ============================================================================

create table if not exists public.nayax_token_cache (
  id text primary key default 'default',
  token text not null,
  expiration_utc timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.nayax_token_cache enable row level security;

-- Solo service_role / admin acceden; ningún operador necesita esto
create policy nayax_token_cache_admin_all on public.nayax_token_cache
  for all to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role))
  with check (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role));
