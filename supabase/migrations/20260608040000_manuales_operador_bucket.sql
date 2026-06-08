-- ============================================================================
-- 67 · Bucket público para capturas del manual del operador
--
-- Imágenes accesibles vía URL directa (sin signed URL) para que el manual
-- las pueda renderizar simple. Subida restringida a admin/dirección.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('manuales-operador', 'manuales-operador', true)
on conflict (id) do update set public = true;

create policy "manuales_operador_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'manuales-operador');

create policy "manuales_operador_admin_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'manuales-operador'
    and (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
  );

create policy "manuales_operador_admin_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'manuales-operador'
    and (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
  );

create policy "manuales_operador_admin_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'manuales-operador'
    and (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
  );
