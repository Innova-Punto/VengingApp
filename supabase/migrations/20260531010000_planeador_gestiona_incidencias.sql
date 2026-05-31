-- ============================================================================
-- 41 · Planeador gestiona incidencias y devoluciones
--
-- El planeador planea la ruta, surte el almacén y recibe lo que el operador
-- regresa. Tiene contexto de qué pasó en campo y por qué, así que también
-- atiende incidencias y autoriza mermas.
-- ============================================================================

-- RLS: planeador puede update incidencias
create policy incidencias_planeador_update on public.incidencias
  for update to authenticated
  using (user_has_role('planeador'::app_role))
  with check (user_has_role('planeador'::app_role));

-- RLS: planeador maneja devoluciones (insert/update via RPC, pero por si)
create policy devoluciones_almacen_planeador_all on public.devoluciones_almacen
  for all to authenticated
  using (user_has_role('planeador'::app_role))
  with check (user_has_role('planeador'::app_role));

-- RPC autorizar_merma_incidencia: planeador también puede autorizar
create or replace function public.autorizar_merma_incidencia(
  p_incidencia_id uuid,
  p_notas_resolucion text default null,
  p_cerrar boolean default false
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_inc record; v_enc record;
  v_gramos int; v_valor numeric(14,2);
  v_tipo_mov movimiento_tipo;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (
    user_has_role('admin'::app_role)
    or user_has_role('direccion'::app_role)
    or user_has_role('planeador'::app_role)
  ) then
    raise exception 'Solo admin, dirección o planeador pueden autorizar mermas';
  end if;
  select * into v_inc from public.incidencias where id = p_incidencia_id for update;
  if v_inc is null then raise exception 'Incidencia no encontrada'; end if;
  if v_inc.autorizada_por is not null then raise exception 'La merma ya fue autorizada previamente'; end if;

  update public.incidencias
     set autorizada_por = v_uid, fecha_autorizacion = now(),
         notas_resolucion = coalesce(p_notas_resolucion, notas_resolucion),
         estado = case when p_cerrar then 'resuelta'::incidencia_estado else estado end,
         fecha_cierre = case when p_cerrar then now() else fecha_cierre end
   where id = p_incidencia_id;

  if v_inc.tipo = 'discrepancia_devolucion'::incidencia_tipo then return p_incidencia_id; end if;
  if v_inc.encartuchado_afectado_id is null or coalesce(v_inc.cartuchos_afectados, 0) <= 0 then
    return p_incidencia_id;
  end if;
  select * into v_enc from public.encartuchados where id = v_inc.encartuchado_afectado_id for update;
  if v_enc is null then raise exception 'Encartuchado afectado no encontrado'; end if;
  if v_enc.cantidad_disponible < v_inc.cartuchos_afectados then
    raise exception 'No hay suficientes cartuchos en el encartuchado para mermar (disponible: %, requerido: %)', v_enc.cantidad_disponible, v_inc.cartuchos_afectados;
  end if;
  update public.encartuchados set cantidad_disponible = cantidad_disponible - v_inc.cartuchos_afectados where id = v_inc.encartuchado_afectado_id;
  v_gramos := v_inc.cartuchos_afectados * v_enc.gramos_por_cartucho;
  v_valor := round(v_gramos * v_enc.costo_promedio_g, 2);
  v_tipo_mov := case when v_inc.maquina_id is not null then 'merma_ruta'::movimiento_tipo else 'merma_encartuchado'::movimiento_tipo end;
  insert into public.movimientos_inventario (
    tipo, producto_id, encartuchado_id, maquina_id,
    presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
    costo_por_gramo_snapshot, valor_movimiento,
    referencia_tabla, referencia_id, usuario_id, notas
  ) values (
    v_tipo_mov, v_inc.producto_afectado_id, v_inc.encartuchado_afectado_id, v_inc.maquina_id,
    'cartucho'::mov_presentacion,
    -v_inc.cartuchos_afectados, 0, -v_gramos,
    v_enc.costo_promedio_g, -v_valor,
    'incidencias', p_incidencia_id, v_uid,
    'Merma autorizada por incidencia ' || v_inc.folio
  );
  return p_incidencia_id;
end;
$$;
grant execute on function public.autorizar_merma_incidencia(uuid, text, boolean) to authenticated;

-- RPC recibir_devolucion: planeador también puede recibir
create or replace function public.recibir_devolucion(
  p_devolucion_id uuid,
  p_cantidad_recibida int,
  p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_devolucion record; v_encartuchado record;
  v_diferencia int; v_gramos int; v_valor numeric(14,2);
  v_incidencia_id uuid; v_nuevo_estado devolucion_estado;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (
    user_has_role('admin'::app_role)
    or user_has_role('direccion'::app_role)
    or user_has_role('almacen'::app_role)
    or user_has_role('planeador'::app_role)
  ) then
    raise exception 'Solo almacén, planeador, admin o dirección pueden recibir devoluciones';
  end if;
  if p_cantidad_recibida < 0 then raise exception 'cantidad_recibida debe ser >= 0'; end if;
  select * into v_devolucion from public.devoluciones_almacen where id = p_devolucion_id for update;
  if v_devolucion is null then raise exception 'Devolución no encontrada'; end if;
  if v_devolucion.estado <> 'pendiente_devolucion' then
    raise exception 'La devolución ya fue procesada (estado: %)', v_devolucion.estado;
  end if;
  select * into v_encartuchado from public.encartuchados where id = v_devolucion.encartuchado_id for update;
  if v_encartuchado is null then raise exception 'Encartuchado origen no encontrado'; end if;
  update public.encartuchados set cantidad_disponible = cantidad_disponible + p_cantidad_recibida where id = v_devolucion.encartuchado_id;
  v_gramos := p_cantidad_recibida * v_encartuchado.gramos_por_cartucho;
  v_valor := round(v_gramos * v_encartuchado.costo_promedio_g, 2);
  if p_cantidad_recibida > 0 then
    insert into public.movimientos_inventario (
      tipo, producto_id, encartuchado_id, presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento, referencia_tabla, referencia_id, usuario_id, notas
    ) values (
      'devolucion_entrada_cartucho'::movimiento_tipo, v_devolucion.producto_id, v_devolucion.encartuchado_id,
      'cartucho'::mov_presentacion, p_cantidad_recibida, 0, v_gramos,
      v_encartuchado.costo_promedio_g, v_valor, 'devoluciones_almacen', v_devolucion.id, v_uid, p_notas
    );
  end if;
  v_diferencia := v_devolucion.cantidad_calculada - p_cantidad_recibida;
  if v_diferencia <> 0 then
    v_nuevo_estado := 'recibida_con_diferencia';
    insert into public.incidencias (
      folio, tipo, severidad, maquina_id, operador_id,
      descripcion, cartuchos_afectados, producto_afectado_id, encartuchado_afectado_id,
      requiere_autorizacion_merma, estado
    ) values (
      '', 'discrepancia_devolucion'::incidencia_tipo,
      case when abs(v_diferencia) >= 3 then 'alta'::incidencia_severidad
           when abs(v_diferencia) >= 1 then 'media'::incidencia_severidad
           else 'baja'::incidencia_severidad end,
      null, v_devolucion.operador_id,
      'Devolución con diferencia: calculados ' || v_devolucion.cantidad_calculada || ', recibidos ' || p_cantidad_recibida ||
      ' (' || (case when v_diferencia > 0 then 'faltan ' else 'sobran ' end) || abs(v_diferencia) || ').',
      abs(v_diferencia), v_devolucion.producto_id, v_devolucion.encartuchado_id,
      v_diferencia > 0, 'abierta'::incidencia_estado
    ) returning id into v_incidencia_id;
  else
    v_nuevo_estado := 'recibida_ok';
    v_incidencia_id := null;
  end if;
  update public.devoluciones_almacen
     set cantidad_recibida_almacen = p_cantidad_recibida,
         estado = v_nuevo_estado, recibida_por = v_uid, fecha_recepcion = now(),
         incidencia_id = coalesce(v_incidencia_id, incidencia_id), notas = p_notas
   where id = p_devolucion_id;
  return p_devolucion_id;
end;
$$;
grant execute on function public.recibir_devolucion(uuid, int, text) to authenticated;
