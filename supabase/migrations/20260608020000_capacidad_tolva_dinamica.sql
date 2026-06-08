-- ============================================================================
-- 65 · Capacidad de tolva dinámica por producto + override por tolva
--
-- Modelo:
--   productos.capacidad_g_por_tolva  -- default cuando este producto está en una tolva
--   tolvas.capacidad_max_g_override  -- override manual de la tolva (físico)
--   tolvas.capacidad_max_g           -- efectiva, mantenida por trigger:
--     capacidad_max_g = coalesce(override, producto.cap_por_tolva, 1200)
--
-- Si producto.capacidad_g_por_tolva cambia, todas las tolvas con ese producto
-- y sin override manual se re-sincronizan automáticamente.
-- ============================================================================

alter table public.productos
  add column if not exists capacidad_g_por_tolva int
  check (capacidad_g_por_tolva is null or capacidad_g_por_tolva > 0);

alter table public.tolvas
  add column if not exists capacidad_max_g_override int
  check (capacidad_max_g_override is null or capacidad_max_g_override > 0);

create or replace function public.tolva_recalc_capacidad()
returns trigger language plpgsql as $$
declare
  v_prod_cap int;
begin
  if new.producto_id is not null then
    select capacidad_g_por_tolva into v_prod_cap
      from public.productos where id = new.producto_id;
  end if;
  new.capacidad_max_g := coalesce(new.capacidad_max_g_override, v_prod_cap, 1200);
  return new;
end;
$$;

drop trigger if exists trg_tolvas_recalc_capacidad on public.tolvas;
create trigger trg_tolvas_recalc_capacidad
  before insert or update of producto_id, capacidad_max_g_override
  on public.tolvas
  for each row execute function public.tolva_recalc_capacidad();

create or replace function public.producto_resync_tolvas_capacidad()
returns trigger language plpgsql as $$
begin
  if new.capacidad_g_por_tolva is distinct from old.capacidad_g_por_tolva then
    update public.tolvas
       set capacidad_max_g = coalesce(capacidad_max_g_override, new.capacidad_g_por_tolva, 1200)
     where producto_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_productos_resync_tolvas_capacidad on public.productos;
create trigger trg_productos_resync_tolvas_capacidad
  after update of capacidad_g_por_tolva on public.productos
  for each row execute function public.producto_resync_tolvas_capacidad();
