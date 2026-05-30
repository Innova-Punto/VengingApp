-- ============================================================================
-- 28 · Encartuchado: función PEPS + trigger de kardex + RLS
-- ============================================================================

create or replace function public.pick_lote_peps_granel(
  p_producto_id        uuid,
  p_gramos_requeridos  int
)
returns table (
  lote_id           uuid,
  gramos_a_consumir int,
  costo_por_gramo   numeric(12,6)
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pendiente int := p_gramos_requeridos;
  v_tomar     int;
  r record;
begin
  if p_gramos_requeridos <= 0 then
    return;
  end if;

  for r in
    select l.id              as lote_id,
           l.gramos_disponibles_granel,
           l.costo_por_gramo as costo
      from public.lotes l
     where l.producto_id = p_producto_id
       and l.gramos_disponibles_granel > 0
       and l.activo = true
     order by l.fecha_recepcion asc, l.created_at asc
  loop
    exit when v_pendiente <= 0;
    v_tomar := least(r.gramos_disponibles_granel, v_pendiente);
    pick_lote_peps_granel.lote_id := r.lote_id;
    pick_lote_peps_granel.gramos_a_consumir := v_tomar;
    pick_lote_peps_granel.costo_por_gramo := r.costo;
    return next;
    v_pendiente := v_pendiente - v_tomar;
  end loop;

  if v_pendiente > 0 then
    raise exception 'Stock insuficiente: faltan % gramos del producto %',
      v_pendiente, p_producto_id;
  end if;
end;
$$;

revoke all on function public.pick_lote_peps_granel(uuid, int) from public;
revoke execute on function public.pick_lote_peps_granel(uuid, int) from anon, authenticated;
grant  execute on function public.pick_lote_peps_granel(uuid, int) to service_role;

create or replace function public.handle_encartuchado_lote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_producto_id uuid;
begin
  update public.lotes
     set gramos_disponibles_granel = gramos_disponibles_granel - new.gramos_consumidos
   where id = new.lote_id
   returning producto_id into v_producto_id;

  if v_producto_id is null then
    raise exception 'lote % no existe', new.lote_id;
  end if;

  insert into public.movimientos_inventario (
    tipo, producto_id, lote_id, encartuchado_id, presentacion,
    gramos, costo_por_gramo_snapshot, valor_movimiento,
    referencia_tabla, referencia_id
  ) values (
    'encartuchado_salida_granel'::movimiento_tipo,
    v_producto_id,
    new.lote_id,
    new.encartuchado_id,
    'granel'::mov_presentacion,
    -new.gramos_consumidos,
    new.costo_por_gramo_lote,
    -round(new.gramos_consumidos * new.costo_por_gramo_lote, 2),
    'encartuchado_lotes',
    new.id
  );

  return new;
end;
$$;

revoke all on function public.handle_encartuchado_lote() from public;
revoke execute on function public.handle_encartuchado_lote() from anon, authenticated;

create trigger trg_encartuchado_lote_kardex
  after insert on public.encartuchado_lotes
  for each row execute function public.handle_encartuchado_lote();

create policy "encartuchados_almacen_all"
  on public.encartuchados for all to authenticated
  using (public.user_has_role('almacen'::app_role))
  with check (public.user_has_role('almacen'::app_role));

create policy "encartuchado_lotes_almacen_all"
  on public.encartuchado_lotes for all to authenticated
  using (public.user_has_role('almacen'::app_role))
  with check (public.user_has_role('almacen'::app_role));
