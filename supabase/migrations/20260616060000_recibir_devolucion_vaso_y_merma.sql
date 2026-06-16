-- ============================================================================
-- recibir_devolucion: ahora también maneja devoluciones de vasos, genera
-- movimiento de merma cuando se reciben menos que los calculados, y bloquea
-- explícitamente cuando se intenta recibir más de lo calculado.
--
-- Reglas nuevas:
--   * recibida > calculada  → ERROR (no permitido)
--   * recibida = calculada  → estado recibida_ok, sin merma
--   * recibida < calculada  → estado recibida_con_diferencia, genera merma_ruta
--                             para la diferencia y abre incidencia
--                             discrepancia_devolucion como hoy
--
-- Detección de tipo: `productos.tipo='vaso'` define si la devolución es de
-- vaso o cartucho. Para vasos:
--   * Suma a `lotes.unidades_disponibles` (usa surtido_item.lote_vaso_id o
--     fallback al último lote activo del producto).
--   * Genera movimiento devolucion_entrada_vaso con presentacion='vaso'.
-- ============================================================================

create or replace function public.recibir_devolucion(
  p_devolucion_id uuid,
  p_cantidad_recibida integer,
  p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_devolucion record;
  v_encartuchado record;
  v_diferencia int;
  v_incidencia_id uuid;
  v_nuevo_estado devolucion_estado;
  v_producto_tipo text;
  v_es_vaso boolean;
  v_lote_id uuid;
  v_costo_unitario numeric;
  v_gramos int;
  v_valor numeric(14, 2);
  v_merma_valor numeric(14, 2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role)
       or user_has_role('direccion'::app_role)
       or user_has_role('almacen'::app_role)
       or user_has_role('planeador'::app_role)) then
    raise exception 'Solo almacén, planeador, admin o dirección pueden recibir devoluciones';
  end if;
  if p_cantidad_recibida < 0 then
    raise exception 'cantidad_recibida debe ser >= 0';
  end if;

  select * into v_devolucion
    from public.devoluciones_almacen
   where id = p_devolucion_id
     for update;
  if v_devolucion is null then raise exception 'Devolución no encontrada'; end if;
  if v_devolucion.estado <> 'pendiente_devolucion' then
    raise exception 'La devolución ya fue procesada (estado: %)', v_devolucion.estado;
  end if;

  if p_cantidad_recibida > v_devolucion.cantidad_calculada then
    raise exception 'No se puede recibir más (%) de lo calculado (%). Si crees que el conteo es correcto, abre una incidencia y ajusta manualmente.',
      p_cantidad_recibida, v_devolucion.cantidad_calculada;
  end if;

  select tipo into v_producto_tipo
    from public.productos where id = v_devolucion.producto_id;
  v_es_vaso := v_producto_tipo = 'vaso';

  v_diferencia := v_devolucion.cantidad_calculada - p_cantidad_recibida;

  if v_es_vaso then
    if v_devolucion.surtido_item_id is not null then
      select lote_vaso_id into v_lote_id
        from public.surtido_items where id = v_devolucion.surtido_item_id;
    end if;
    if v_lote_id is null then
      select id into v_lote_id from public.lotes
       where producto_id = v_devolucion.producto_id and activo = true
       order by created_at desc limit 1;
    end if;

    if v_lote_id is not null then
      select costo_por_gramo into v_costo_unitario
        from public.lotes where id = v_lote_id for update;
      if p_cantidad_recibida > 0 then
        update public.lotes
           set unidades_disponibles = coalesce(unidades_disponibles, 0) + p_cantidad_recibida
         where id = v_lote_id;
      end if;
    end if;
    v_costo_unitario := coalesce(v_costo_unitario, 0);

    if p_cantidad_recibida > 0 then
      v_valor := round(p_cantidad_recibida * v_costo_unitario, 2);
      insert into public.movimientos_inventario (
        tipo, producto_id, presentacion,
        cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas
      ) values (
        'devolucion_entrada_vaso'::movimiento_tipo,
        v_devolucion.producto_id, 'vaso'::mov_presentacion,
        0, p_cantidad_recibida, 0,
        v_costo_unitario, v_valor,
        'devoluciones_almacen', v_devolucion.id, v_uid, p_notas
      );
    end if;

    if v_diferencia > 0 then
      v_merma_valor := round(v_diferencia * v_costo_unitario, 2);
      insert into public.movimientos_inventario (
        tipo, producto_id, presentacion,
        cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas
      ) values (
        'merma_ruta'::movimiento_tipo,
        v_devolucion.producto_id, 'vaso'::mov_presentacion,
        0, v_diferencia, 0,
        v_costo_unitario, v_merma_valor,
        'devoluciones_almacen', v_devolucion.id, v_uid,
        'Merma vasos por devolución incompleta'
      );
    end if;

  else
    if v_devolucion.encartuchado_id is null then
      raise exception 'Devolución de cartucho sin encartuchado_id (producto %)',
        v_devolucion.producto_id;
    end if;

    select * into v_encartuchado from public.encartuchados
     where id = v_devolucion.encartuchado_id for update;
    if v_encartuchado is null then raise exception 'Encartuchado origen no encontrado'; end if;

    if p_cantidad_recibida > 0 then
      update public.encartuchados
         set cantidad_disponible = cantidad_disponible + p_cantidad_recibida
       where id = v_devolucion.encartuchado_id;

      v_gramos := p_cantidad_recibida * v_encartuchado.gramos_por_cartucho;
      v_valor := round(v_gramos * v_encartuchado.costo_promedio_g, 2);
      insert into public.movimientos_inventario (
        tipo, producto_id, encartuchado_id, presentacion,
        cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas
      ) values (
        'devolucion_entrada_cartucho'::movimiento_tipo,
        v_devolucion.producto_id, v_devolucion.encartuchado_id,
        'cartucho'::mov_presentacion,
        p_cantidad_recibida, 0, v_gramos,
        v_encartuchado.costo_promedio_g, v_valor,
        'devoluciones_almacen', v_devolucion.id, v_uid, p_notas
      );
    end if;

    if v_diferencia > 0 then
      v_gramos := v_diferencia * v_encartuchado.gramos_por_cartucho;
      v_merma_valor := round(v_gramos * v_encartuchado.costo_promedio_g, 2);
      insert into public.movimientos_inventario (
        tipo, producto_id, encartuchado_id, presentacion,
        cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas
      ) values (
        'merma_ruta'::movimiento_tipo,
        v_devolucion.producto_id, v_devolucion.encartuchado_id,
        'cartucho'::mov_presentacion,
        v_diferencia, 0, v_gramos,
        v_encartuchado.costo_promedio_g, v_merma_valor,
        'devoluciones_almacen', v_devolucion.id, v_uid,
        'Merma cartuchos por devolución incompleta'
      );
    end if;
  end if;

  if v_diferencia > 0 then
    v_nuevo_estado := 'recibida_con_diferencia';
    insert into public.incidencias (
      folio, tipo, severidad, maquina_id, operador_id,
      descripcion, cartuchos_afectados, producto_afectado_id,
      encartuchado_afectado_id, requiere_autorizacion_merma, estado
    ) values (
      '',
      'discrepancia_devolucion'::incidencia_tipo,
      case
        when abs(v_diferencia) >= 3 then 'alta'::incidencia_severidad
        when abs(v_diferencia) >= 1 then 'media'::incidencia_severidad
        else 'baja'::incidencia_severidad
      end,
      null, v_devolucion.operador_id,
      'Devolución con merma: calculados ' || v_devolucion.cantidad_calculada
        || ', recibidos ' || p_cantidad_recibida
        || ' (faltan ' || v_diferencia || (case when v_es_vaso then ' vasos' else ' cartuchos' end) || ').',
      v_diferencia, v_devolucion.producto_id, v_devolucion.encartuchado_id,
      true, 'abierta'::incidencia_estado
    )
    returning id into v_incidencia_id;
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
