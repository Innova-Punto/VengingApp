-- ============================================================================
-- 69 · Productos pre-empacados (no requieren encartuchado)
--
-- Algunos productos llegan listos del proveedor (café en grano 1kg,
-- chocolate 908g). Cada bolsa es 1 cartucho directo. En recepción se crea
-- automáticamente el encartuchado vinculado al lote, saltando el paso
-- intermedio de encartuchado manual.
-- ============================================================================

alter table public.productos
  add column if not exists requiere_encartuchado boolean not null default true;

comment on column public.productos.requiere_encartuchado is
  'true (default): producto se recibe en granel y debe encartucharse en almacén. false: producto llega pre-empacado (ej. café en grano 1kg, chocolate 908g) y cada bolsa cuenta como 1 cartucho directo. La recepción genera el encartuchado automáticamente sin paso intermedio.';
