-- ============================================================================
-- 23 · Catálogo de planogramas (templates reutilizables)
-- ============================================================================

create table public.planogramas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  descripcion text,
  num_tolvas  int not null default 8 check (num_tolvas between 1 and 8),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id)
);

create table public.planograma_items (
  id              uuid primary key default gen_random_uuid(),
  planograma_id   uuid not null references public.planogramas(id) on delete cascade,
  numero          int not null check (numero between 1 and 8),
  producto_id     uuid not null references public.productos(id) on delete restrict,
  gramaje_servicio int not null check (gramaje_servicio > 0),
  precio_venta    numeric(10,2) not null check (precio_venta >= 0),
  nayax_item_code text,
  created_at      timestamptz not null default now(),
  unique (planograma_id, numero)
);

create index planograma_items_planograma_idx on public.planograma_items(planograma_id);

create trigger trg_planogramas_set_updated_at
  before update on public.planogramas
  for each row execute function public.set_updated_at();

alter table public.planogramas enable row level security;
alter table public.planograma_items enable row level security;

create policy "planogramas_authenticated_read"
  on public.planogramas for select to authenticated using (true);
create policy "planogramas_admin_all"
  on public.planogramas for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role));

create policy "planograma_items_authenticated_read"
  on public.planograma_items for select to authenticated using (true);
create policy "planograma_items_admin_all"
  on public.planograma_items for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role));
