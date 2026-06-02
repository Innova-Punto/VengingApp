-- ============================================================================
-- 49 · productos.nayax_product_ids[] (1 producto local → hasta 4 NayaxIDs)
--
-- Nayax asigna un NayaxProductID distinto por planograma para el mismo
-- producto físico (ej. "Vainilla Isopure" en 3 gimnasios = 3 NayaxIDs).
-- Antes guardábamos uno solo (UNIQUE single column) y aparecían como
-- productos distintos. Ahora un producto local puede tener hasta 4
-- NayaxIDs vinculados (cap operativo para evitar acumulación accidental).
--
-- Invariantes:
--   - max 4 NayaxIDs por producto local (CHECK)
--   - cada NayaxID solo puede estar en UN producto local (trigger)
--   - sin duplicados dentro del mismo array (trigger)
-- ============================================================================

-- Dropea la columna single anterior (era UNIQUE int, no permitía 1:N)
alter table public.productos drop column if exists nayax_product_id;

alter table public.productos
  add column if not exists nayax_product_ids int[] not null default '{}';

alter table public.productos
  add constraint productos_nayax_ids_max_4
  check (coalesce(array_length(nayax_product_ids, 1), 0) <= 4);

-- Trigger: garantiza unicidad global de cada NayaxID y dentro del array
create or replace function public.check_productos_nayax_ids_unique()
returns trigger
language plpgsql
as $$
declare
  v_otro_id uuid;
  v_arr int[];
begin
  v_arr := coalesce(new.nayax_product_ids, '{}'::int[]);

  if array_length(v_arr, 1) is null then
    return new;
  end if;

  -- Sin duplicados internos
  if array_length(v_arr, 1) <>
     (select count(*) from unnest(v_arr) as u) then
    raise exception 'NayaxProductIDs duplicados dentro del array';
  end if;

  -- Cada elemento no debe existir en otro producto local
  select p2.id into v_otro_id
  from public.productos p2
  where p2.id is distinct from new.id
    and p2.nayax_product_ids && v_arr
  limit 1;

  if v_otro_id is not null then
    raise exception 'NayaxProductID ya está vinculado a otro producto local (%)', v_otro_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_productos_nayax_ids_unique on public.productos;
create trigger trg_productos_nayax_ids_unique
  before insert or update of nayax_product_ids on public.productos
  for each row execute function public.check_productos_nayax_ids_unique();

-- Índice GIN para lookup eficiente (ventas Nayax → producto local):
--   select id from productos where nayax_product_ids @> array[12345]
create index if not exists productos_nayax_product_ids_gin
  on public.productos using gin (nayax_product_ids);
