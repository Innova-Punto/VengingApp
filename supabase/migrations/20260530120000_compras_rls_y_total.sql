-- ============================================================================
-- 25 · RLS para compras + recálculo automático de totales en OC
-- ============================================================================

create policy "ordenes_compra_compras_all"
  on public.ordenes_compra
  for all
  to authenticated
  using (public.user_has_role('compras'::app_role))
  with check (public.user_has_role('compras'::app_role));

create policy "oc_items_compras_all"
  on public.oc_items
  for all
  to authenticated
  using (public.user_has_role('compras'::app_role))
  with check (public.user_has_role('compras'::app_role));

create or replace function public.recalcular_total_oc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oc_id   uuid;
  v_subtotal numeric(14,2);
  v_iva_rate numeric(5,4) := 0.16;
begin
  v_oc_id := coalesce(new.oc_id, old.oc_id);

  select coalesce(sum(subtotal_item), 0)
    into v_subtotal
    from public.oc_items
   where oc_id = v_oc_id;

  update public.ordenes_compra
     set subtotal = v_subtotal,
         iva      = round(v_subtotal * v_iva_rate, 2),
         total    = v_subtotal + round(v_subtotal * v_iva_rate, 2)
   where id = v_oc_id;

  return coalesce(new, old);
end;
$$;

revoke all on function public.recalcular_total_oc() from public;
revoke execute on function public.recalcular_total_oc() from anon, authenticated;

create trigger trg_oc_items_recalcular_total
  after insert or update or delete on public.oc_items
  for each row execute function public.recalcular_total_oc();
