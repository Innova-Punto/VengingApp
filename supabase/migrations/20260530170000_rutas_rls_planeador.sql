-- ============================================================================
-- 30 · RLS para que planeador administre rutas y asignaciones
-- ============================================================================

create policy "rutas_planeador_all"
  on public.rutas for all to authenticated
  using (public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('planeador'::app_role));

create policy "ruta_maquinas_planeador_all"
  on public.ruta_maquinas for all to authenticated
  using (public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('planeador'::app_role));

create policy "asignaciones_diarias_planeador_all"
  on public.asignaciones_diarias for all to authenticated
  using (public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('planeador'::app_role));

create policy "asignacion_maquinas_planeador_all"
  on public.asignacion_maquinas for all to authenticated
  using (public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('planeador'::app_role));

create policy "surtidos_planeador_all"
  on public.surtidos for all to authenticated
  using (public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('planeador'::app_role));

create policy "surtido_items_planeador_all"
  on public.surtido_items for all to authenticated
  using (public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('planeador'::app_role));
