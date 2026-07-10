-- ============================================================================
-- 89 · Costo unitario a 6 decimales en OC y presentaciones
--
-- costo_unitario estaba en numeric(12,2): insuficiente para costos por gramo
-- (p. ej. $0.614874/g). Se amplía a numeric(14,6). Es solo ensanchar precisión,
-- sin pérdida de datos (los valores de 2 decimales caben sin cambio).
--
-- subtotal_item se mantiene en numeric(14,2): es un total en pesos.
-- La app (compras/ordenes/actions.ts y admin/proveedores/actions.ts) también se
-- ajustó para redondear costo_unitario a 6 decimales y los inputs a step 0.000001.
-- ============================================================================

alter table public.oc_items
  alter column costo_unitario type numeric(14,6);

alter table public.presentaciones_proveedor
  alter column costo_unitario type numeric(14,6);
