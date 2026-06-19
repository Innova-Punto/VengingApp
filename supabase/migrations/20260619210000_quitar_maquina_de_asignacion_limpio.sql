-- ============================================================================
-- Quitar máquina de asignación con limpieza completa.
--
-- Antes: el action `quitarMaquinaDeAsig` solo borraba `asignacion_maquinas`,
-- dejando huérfanos los `surtido_items` de esa máquina. Resultado:
--   - El header del surtido mostraba totales inflados (cartuchos/vasos que ya
--     no se iban a llevar).
--   - Si el PEPS ya se había aplicado, el inventario quedaba "asignado" en
--     el encartuchado/lote sin nadie que lo consumiera.
--
-- Esta RPC hace todo: borra los surtido_items de la máquina en cualquier
-- surtido de la asignación, reintegra inventario al encartuchado (cartuchos)
-- o al lote (vasos) si el PEPS ya se había aplicado, deja movimiento de
-- ajuste por trazabilidad, y borra la fila de asignacion_maquinas.
-- ============================================================================

create or replace function public.quitar_maquina_de_asignacion(
  p_asignacion_maquina_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_asig_id uuid;
  v_maq_id uuid;
  v_item record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role)
       or user_has_role('direccion'::app_role)
       or user_has_role('planeador'::app_role)) then
    raise exception 'Solo admin, dirección o planeador pueden quitar máquinas.';
  end if;

  select asignacion_id, maquina_id into v_asig_id, v_maq_id
    from public.asignacion_maquinas where id = p_asignacion_maquina_id;
  if v_asig_id is null then raise exception 'Asignación-máquina no encontrada'; end if;

  for v_item in
    select si.id, si.encartuchado_id, si.lote_vaso_id, si.producto_id,
           si.cartuchos_entregados, si.vasos_entregados
      from public.surtido_items si
      join public.surtidos s on s.id = si.surtido_id
     where s.asignacion_id = v_asig_id
       and si.maquina_id = v_maq_id
  loop
    if v_item.encartuchado_id is not null and v_item.cartuchos_entregados > 0 then
      update public.encartuchados
         set cantidad_disponible = cantidad_disponible + v_item.cartuchos_entregados
       where id = v_item.encartuchado_id;

      insert into public.movimientos_inventario (
        tipo, producto_id, encartuchado_id, presentacion,
        cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas
      )
      select 'ajuste_conteo_almacen'::movimiento_tipo,
             v_item.producto_id, v_item.encartuchado_id,
             'cartucho'::mov_presentacion,
             v_item.cartuchos_entregados, 0,
             v_item.cartuchos_entregados * e.gramos_por_cartucho,
             e.costo_promedio_g,
             round(v_item.cartuchos_entregados * e.gramos_por_cartucho * e.costo_promedio_g, 2),
             'surtido_items', v_item.id, v_uid,
             'Reverso de surtido por quitar máquina de la asignación'
        from public.encartuchados e where e.id = v_item.encartuchado_id;
    end if;

    if v_item.lote_vaso_id is not null and v_item.vasos_entregados > 0 then
      update public.lotes
         set unidades_disponibles = coalesce(unidades_disponibles, 0) + v_item.vasos_entregados
       where id = v_item.lote_vaso_id;

      insert into public.movimientos_inventario (
        tipo, producto_id, presentacion,
        cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas
      )
      select 'ajuste_conteo_almacen'::movimiento_tipo,
             v_item.producto_id, 'vaso'::mov_presentacion,
             0, v_item.vasos_entregados, 0,
             l.costo_por_gramo,
             round(v_item.vasos_entregados * coalesce(l.costo_por_gramo, 0), 2),
             'surtido_items', v_item.id, v_uid,
             'Reverso de surtido por quitar máquina de la asignación · VASOS'
        from public.lotes l where l.id = v_item.lote_vaso_id;
    end if;

    delete from public.surtido_items where id = v_item.id;
  end loop;

  delete from public.asignacion_maquinas where id = p_asignacion_maquina_id;
end;
$$;

grant execute on function public.quitar_maquina_de_asignacion(uuid) to authenticated;
