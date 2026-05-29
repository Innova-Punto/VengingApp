-- Compras también puede mutar productos (crear, actualizar, soft-delete).
create policy "productos_compras_all"
  on public.productos
  for all
  to authenticated
  using (public.user_has_role('compras'::app_role))
  with check (public.user_has_role('compras'::app_role));
