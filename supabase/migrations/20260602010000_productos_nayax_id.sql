-- ============================================================================
-- 48 · Columna nayax_product_id en productos
--
-- Para evitar duplicados al sincronizar con Lynx, cada producto local
-- guarda su NayaxProductID. El UNIQUE garantiza que un producto Nayax
-- solo apunte a un producto local.
-- ============================================================================

alter table public.productos
  add column if not exists nayax_product_id int;

create unique index if not exists productos_nayax_product_id_uidx
  on public.productos (nayax_product_id)
  where nayax_product_id is not null;
