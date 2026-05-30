-- ============================================================================
-- 31 · PEPS para cartuchos y vasos (usado al completar surtidos)
-- ============================================================================

create or replace function public.pick_batch_peps_cartucho(
  p_producto_id        uuid,
  p_cartuchos_requeridos int
)
returns table (
  encartuchado_id   uuid,
  cantidad_tomar    int,
  costo_promedio_g  numeric(12,6)
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pendiente int := p_cartuchos_requeridos;
  v_tomar     int;
  r record;
begin
  if p_cartuchos_requeridos <= 0 then
    return;
  end if;

  for r in
    select e.id, e.cantidad_disponible, e.costo_promedio_g
      from public.encartuchados e
     where e.producto_id = p_producto_id
       and e.cantidad_disponible > 0
     order by e.fecha asc, e.created_at asc
  loop
    exit when v_pendiente <= 0;
    v_tomar := least(r.cantidad_disponible, v_pendiente);
    pick_batch_peps_cartucho.encartuchado_id := r.id;
    pick_batch_peps_cartucho.cantidad_tomar := v_tomar;
    pick_batch_peps_cartucho.costo_promedio_g := r.costo_promedio_g;
    return next;
    v_pendiente := v_pendiente - v_tomar;
  end loop;

  if v_pendiente > 0 then
    raise exception 'Cartuchos insuficientes: faltan % del producto %',
      v_pendiente, p_producto_id;
  end if;
end;
$$;

revoke all on function public.pick_batch_peps_cartucho(uuid, int) from public;
revoke execute on function public.pick_batch_peps_cartucho(uuid, int) from anon, authenticated;

create or replace function public.pick_lote_peps_vaso(
  p_producto_id        uuid,
  p_unidades_requeridas int
)
returns table (
  lote_id           uuid,
  cantidad_tomar    int,
  costo_por_unidad  numeric(12,6)
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pendiente int := p_unidades_requeridas;
  v_tomar     int;
  r record;
begin
  if p_unidades_requeridas <= 0 then
    return;
  end if;

  for r in
    select l.id, l.unidades_disponibles, l.costo_por_gramo as costo
      from public.lotes l
     where l.producto_id = p_producto_id
       and l.unidades_disponibles is not null
       and l.unidades_disponibles > 0
       and l.activo = true
     order by l.fecha_recepcion asc, l.created_at asc
  loop
    exit when v_pendiente <= 0;
    v_tomar := least(r.unidades_disponibles, v_pendiente);
    pick_lote_peps_vaso.lote_id := r.id;
    pick_lote_peps_vaso.cantidad_tomar := v_tomar;
    pick_lote_peps_vaso.costo_por_unidad := r.costo;
    return next;
    v_pendiente := v_pendiente - v_tomar;
  end loop;

  if v_pendiente > 0 then
    raise exception 'Vasos insuficientes: faltan % unidades del producto %',
      v_pendiente, p_producto_id;
  end if;
end;
$$;

revoke all on function public.pick_lote_peps_vaso(uuid, int) from public;
revoke execute on function public.pick_lote_peps_vaso(uuid, int) from anon, authenticated;
