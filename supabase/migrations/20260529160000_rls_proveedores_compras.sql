-- Compras también puede mutar proveedores y presentaciones_proveedor.
create policy "proveedores_compras_all"
  on public.proveedores
  for all
  to authenticated
  using (public.user_has_role('compras'::app_role))
  with check (public.user_has_role('compras'::app_role));

create policy "presentaciones_proveedor_compras_all"
  on public.presentaciones_proveedor
  for all
  to authenticated
  using (public.user_has_role('compras'::app_role))
  with check (public.user_has_role('compras'::app_role));
