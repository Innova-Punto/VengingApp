-- ============================================================================
-- 26 · Recepciones, lotes y kardex automático
-- ============================================================================

create policy "recepciones_almacen_all"
  on public.recepciones for all to authenticated
  using (public.user_has_role('almacen'::app_role))
  with check (public.user_has_role('almacen'::app_role));

create policy "lotes_almacen_all"
  on public.lotes for all to authenticated
  using (public.user_has_role('almacen'::app_role))
  with check (public.user_has_role('almacen'::app_role));

create policy "recepcion_items_almacen_all"
  on public.recepcion_items for all to authenticated
  using (public.user_has_role('almacen'::app_role))
  with check (public.user_has_role('almacen'::app_role));

create policy "oc_items_almacen_update"
  on public.oc_items for update to authenticated
  using (public.user_has_role('almacen'::app_role))
  with check (public.user_has_role('almacen'::app_role));

create policy "ordenes_compra_almacen_update"
  on public.ordenes_compra for update to authenticated
  using (public.user_has_role('almacen'::app_role))
  with check (public.user_has_role('almacen'::app_role));

create or replace function public.handle_recepcion_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oc_id uuid;
  v_oc_items_total int;
  v_oc_items_completos int;
  v_producto_id uuid;
  v_producto_tipo producto_tipo;
  v_costo_por_gramo numeric(12,6);
begin
  update public.oc_items
     set recibido = recibido + new.presentaciones_recibidas
   where id = new.oc_item_id
   returning oc_id into v_oc_id;

  if v_oc_id is null then
    raise exception 'oc_item % no existe', new.oc_item_id;
  end if;

  select count(*), count(*) filter (where recibido >= cantidad)
    into v_oc_items_total, v_oc_items_completos
    from public.oc_items
   where oc_id = v_oc_id;

  update public.ordenes_compra
     set estado = case
       when v_oc_items_completos >= v_oc_items_total then 'recibida'::oc_estado
       else 'parcial'::oc_estado
     end
   where id = v_oc_id
     and estado in ('enviada'::oc_estado, 'parcial'::oc_estado);

  select p.id, p.tipo, l.costo_por_gramo
    into v_producto_id, v_producto_tipo, v_costo_por_gramo
    from public.lotes l
    join public.productos p on p.id = l.producto_id
   where l.id = new.lote_id;

  insert into public.movimientos_inventario (
    tipo, producto_id, lote_id, presentacion,
    gramos, cantidad_vasos,
    costo_por_gramo_snapshot, valor_movimiento,
    referencia_tabla, referencia_id
  ) values (
    'recepcion'::movimiento_tipo,
    v_producto_id,
    new.lote_id,
    case when v_producto_tipo = 'polvo' then 'granel'::mov_presentacion
         else 'vaso'::mov_presentacion end,
    coalesce(new.peso_total_gramos, 0),
    coalesce(new.unidades_totales, 0),
    v_costo_por_gramo,
    case when v_producto_tipo = 'polvo'
         then round(coalesce(new.peso_total_gramos,0) * v_costo_por_gramo, 2)
         else round(coalesce(new.unidades_totales,0) * v_costo_por_gramo, 2)
    end,
    'recepcion_items',
    new.id
  );

  return new;
end;
$$;

revoke all on function public.handle_recepcion_item() from public;
revoke execute on function public.handle_recepcion_item() from anon, authenticated;

create trigger trg_recepcion_item_kardex
  after insert on public.recepcion_items
  for each row execute function public.handle_recepcion_item();
