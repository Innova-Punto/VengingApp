-- ============================================================================
-- 33 · Devoluciones de almacén — RPC para recibir cartuchos del operador
--
-- El operador termina su jornada y los cartuchos no usados generan
-- devoluciones_almacen pendientes. Cuando regresa al almacén, almacén
-- los cuenta y registra. Esta operación regresa los cartuchos al
-- encartuchado, registra kardex y si hay diferencia entre lo calculado
-- y lo recibido, dispara una incidencia automática.
-- ============================================================================

create or replace function public.recibir_devolucion(
  p_devolucion_id uuid,
  p_cantidad_recibida int,
  p_notas text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_devolucion record;
  v_encartuchado record;
  v_diferencia int;
  v_gramos int;
  v_valor numeric(14,2);
  v_incidencia_id uuid;
  v_nuevo_estado devolucion_estado;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if not (
    user_has_role('admin'::app_role)
    or user_has_role('direccion'::app_role)
    or user_has_role('almacen'::app_role)
  ) then
    raise exception 'Solo almacén, admin o dirección pueden recibir devoluciones';
  end if;

  if p_cantidad_recibida < 0 then
    raise exception 'cantidad_recibida debe ser >= 0';
  end if;

  select * into v_devolucion
    from public.devoluciones_almacen
   where id = p_devolucion_id
   for update;

  if v_devolucion is null then
    raise exception 'Devolución no encontrada';
  end if;

  if v_devolucion.estado <> 'pendiente_devolucion' then
    raise exception 'La devolución ya fue procesada (estado: %)', v_devolucion.estado;
  end if;

  select * into v_encartuchado
    from public.encartuchados
   where id = v_devolucion.encartuchado_id
   for update;

  if v_encartuchado is null then
    raise exception 'Encartuchado origen no encontrado';
  end if;

  -- Regresa los cartuchos al encartuchado
  update public.encartuchados
     set cantidad_disponible = cantidad_disponible + p_cantidad_recibida
   where id = v_devolucion.encartuchado_id;

  v_gramos := p_cantidad_recibida * v_encartuchado.gramos_por_cartucho;
  v_valor := round(v_gramos * v_encartuchado.costo_promedio_g, 2);

  if p_cantidad_recibida > 0 then
    insert into public.movimientos_inventario (
      tipo, producto_id, encartuchado_id,
      presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, notas
    ) values (
      'devolucion_entrada_cartucho'::movimiento_tipo,
      v_devolucion.producto_id, v_devolucion.encartuchado_id,
      'cartucho'::mov_presentacion,
      p_cantidad_recibida, 0, v_gramos,
      v_encartuchado.costo_promedio_g, v_valor,
      'devoluciones_almacen', v_devolucion.id, v_uid,
      p_notas
    );
  end if;

  v_diferencia := v_devolucion.cantidad_calculada - p_cantidad_recibida;

  if v_diferencia <> 0 then
    v_nuevo_estado := 'recibida_con_diferencia';
    insert into public.incidencias (
      folio, tipo, severidad,
      maquina_id, operador_id,
      descripcion,
      cartuchos_afectados, producto_afectado_id, encartuchado_afectado_id,
      requiere_autorizacion_merma,
      estado
    ) values (
      '',
      'discrepancia_devolucion'::incidencia_tipo,
      case when abs(v_diferencia) >= 3 then 'alta'::incidencia_severidad
           when abs(v_diferencia) >= 1 then 'media'::incidencia_severidad
           else 'baja'::incidencia_severidad end,
      null,
      v_devolucion.operador_id,
      'Devolución con diferencia: calculados '
        || v_devolucion.cantidad_calculada
        || ', recibidos '
        || p_cantidad_recibida
        || ' ('
        || (case when v_diferencia > 0 then 'faltan ' else 'sobran ' end)
        || abs(v_diferencia)
        || ').',
      abs(v_diferencia),
      v_devolucion.producto_id,
      v_devolucion.encartuchado_id,
      v_diferencia > 0,
      'abierta'::incidencia_estado
    ) returning id into v_incidencia_id;
  else
    v_nuevo_estado := 'recibida_ok';
    v_incidencia_id := null;
  end if;

  update public.devoluciones_almacen
     set cantidad_recibida_almacen = p_cantidad_recibida,
         estado = v_nuevo_estado,
         recibida_por = v_uid,
         fecha_recepcion = now(),
         incidencia_id = coalesce(v_incidencia_id, incidencia_id),
         notas = p_notas
   where id = p_devolucion_id;

  return p_devolucion_id;
end;
$$;

revoke all on function public.recibir_devolucion(uuid, int, text) from public;
grant execute on function public.recibir_devolucion(uuid, int, text) to authenticated;
