-- ============================================================================
-- 63 · Editar gramos_medidos de un pesaje (auditoría)
--
-- Permite a admin/direccion corregir el valor reportado por el operador.
-- - Calcula el delta entre el nuevo y el viejo gramos_medidos.
-- - Ajusta tolva.inventario_actual_g por ese delta.
-- - Inserta un movimiento_inventario compensatorio (ajuste_conteo_maquina)
--   con el delta, manteniendo el kardex append-only.
-- - Recalcula diferencia_porcentaje y valor_diferencia del item.
-- ============================================================================

create or replace function public.editar_pesaje_tolva_item(
  p_item_id uuid,
  p_nuevos_gramos int,
  p_motivo text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_item record;
  v_tolva record;
  v_delta int;
  v_nuevo_diff int;
  v_nuevo_diff_pct numeric(8,4);
  v_nuevo_valor numeric(14,2);
  v_costo numeric(12,6);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'Solo admin o dirección pueden editar pesajes';
  end if;
  if p_nuevos_gramos < 0 then
    raise exception 'gramos_medidos debe ser >= 0';
  end if;

  select pti.*, pm.maquina_id as v_maquina_id
    into v_item
    from public.pesaje_tolva_items pti
    join public.pesajes_maquina pm on pm.id = pti.pesaje_id
    where pti.id = p_item_id;
  if v_item is null then
    raise exception 'Pesaje item % no existe', p_item_id;
  end if;

  select * into v_tolva from public.tolvas where id = v_item.tolva_id;

  v_delta := p_nuevos_gramos - v_item.gramos_medidos;
  if v_delta = 0 then
    return;
  end if;

  v_costo := coalesce(v_tolva.costo_promedio_g_actual, 0);
  v_nuevo_diff := p_nuevos_gramos - v_item.gramos_teoricos;
  v_nuevo_diff_pct := case
    when v_item.gramos_teoricos > 0 then
      round(abs(v_nuevo_diff)::numeric / v_item.gramos_teoricos * 100, 4)
    else null
  end;
  v_nuevo_valor := round(v_nuevo_diff * v_costo, 2);

  update public.pesaje_tolva_items set
    gramos_medidos = p_nuevos_gramos,
    diferencia_porcentaje = v_nuevo_diff_pct,
    valor_diferencia = v_nuevo_valor,
    alerta_generada = coalesce(v_nuevo_diff_pct >= 5, false),
    notas = case
      when p_motivo is null or p_motivo = '' then notas
      else coalesce(notas || E'\n', '') || '[' || now()::text || '] edición: ' || p_motivo
    end
  where id = p_item_id;

  update public.tolvas set
    inventario_actual_g = inventario_actual_g + v_delta
  where id = v_item.tolva_id;

  if v_tolva.producto_id is not null then
    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id, tolva_id,
      presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, notas
    ) values (
      'ajuste_conteo_maquina'::movimiento_tipo,
      v_tolva.producto_id, v_item.v_maquina_id, v_item.tolva_id,
      'polvo_en_tolva'::mov_presentacion,
      0, 0, v_delta,
      v_costo,
      round(v_delta * v_costo, 2),
      'pesaje_tolva_items', p_item_id, v_uid,
      'Edición de pesaje · delta ' || v_delta || 'g' ||
      case when p_motivo is null then '' else ' · ' || p_motivo end
    );
  end if;
end;
$$;

revoke all on function public.editar_pesaje_tolva_item(uuid, int, text) from public;
grant execute on function public.editar_pesaje_tolva_item(uuid, int, text) to authenticated;
