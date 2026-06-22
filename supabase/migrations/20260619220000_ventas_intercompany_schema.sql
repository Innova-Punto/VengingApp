-- ============================================================================
-- Ventas intercompany: salida de inventario hacia otra empresa del grupo.
-- No factura externamente — solo registro interno para utilidad + inventario.
-- ============================================================================

-- 1) Flag en clientes
alter table public.clientes
  add column if not exists es_intercompany boolean not null default false;

comment on column public.clientes.es_intercompany is
  'TRUE si este cliente es otra empresa del grupo (intercompany). Aparece solo en flujos de venta intercompany.';

-- 2) Enum de presentación (solo granel y vaso por ahora)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'venta_intercompany_presentacion') then
    create type public.venta_intercompany_presentacion as enum ('granel', 'vaso');
  end if;
end $$;

-- 3) Tabla con snapshots (costo, margen, precio, utilidad)
create table if not exists public.ventas_intercompany (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  empresa_destino_id uuid not null references public.clientes(id),
  fecha timestamptz not null default now(),
  producto_id uuid not null references public.productos(id),
  presentacion venta_intercompany_presentacion not null,
  cantidad int not null check (cantidad > 0),
  costo_unitario_snapshot numeric(12, 6) not null,
  costo_total numeric(14, 2) not null,
  margen_porcentaje numeric(7, 4) not null check (margen_porcentaje >= 0),
  precio_venta_neto numeric(14, 2) not null,
  utilidad numeric(14, 2) not null,
  notas text,
  usuario_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists ventas_intercompany_fecha_idx on public.ventas_intercompany(fecha desc);
create index if not exists ventas_intercompany_empresa_idx on public.ventas_intercompany(empresa_destino_id);

alter table public.ventas_intercompany enable row level security;

create policy ventas_intercompany_read on public.ventas_intercompany
  for select to authenticated
  using (user_has_role('admin'::app_role)
      or user_has_role('direccion'::app_role)
      or user_has_role('almacen'::app_role));

create policy ventas_intercompany_insert on public.ventas_intercompany
  for insert to authenticated
  with check (user_has_role('admin'::app_role)
           or user_has_role('direccion'::app_role)
           or user_has_role('almacen'::app_role));

create sequence if not exists ventas_intercompany_folio_seq;
create or replace function public.set_folio_venta_intercompany()
returns trigger language plpgsql as $$
begin
  if NEW.folio is null then
    NEW.folio := 'VIC-' || lpad(nextval('ventas_intercompany_folio_seq')::text, 6, '0');
  end if;
  return NEW;
end $$;

drop trigger if exists trg_folio_venta_intercompany on public.ventas_intercompany;
create trigger trg_folio_venta_intercompany
  before insert on public.ventas_intercompany
  for each row execute function public.set_folio_venta_intercompany();
