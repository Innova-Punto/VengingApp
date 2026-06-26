-- ============================================================================
-- Cancelar ruta surtida con reintegro de inventario + extensión del cron.
--
-- Problema: si el operador nunca inicia jornada (asignación queda en 'surtida'),
-- el cron de fin de día (que solo cerraba 'en_jornada') no la tocaba, y el
-- surtido ya descontado del almacén quedaba "fantasma".
--
-- Solución:
--   1. cancelar_ruta_surtida() — reintegra cartuchos a encartuchados y vasos
--      al lote, con movimientos ajuste_conteo_almacen, y cancela la asignación.
--      Usada por el botón de administración y por el cron.
--   2. cerrar_jornadas_pendientes_fin_de_dia() ahora también cancela+reintegra
--      las rutas 'surtida'/'planeada' rezagadas de días anteriores.
-- ============================================================================

create or replace function public.cancelar_ruta_surtida(
  p_asignacion_id uuid,
  p_motivo text,
  p_uid uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := coalesce(p_uid, auth.uid());
  v_estado asignacion_estado;
  v_cart int := 0;
  v_vasos int := 0;
  v_surtido_id uuid;
begin
  if p_uid is null then
    if v_uid is null then raise exception 'No autenticado'; end if;
    if not (user_has_role('admin'::app_role)
         or user_has_role('direccion'::app_role)
         or user_has_role('planeador'::app_role)) then
      raise exception 'Solo admin, dirección o planeador pueden cancelar rutas surtidas.';
    end if;
  end if;

  select estado into v_estado
    from public.asignaciones_diarias where id = p_asignacion_id;
  if v_estado is null then raise exception 'Asignación no encontrada'; end if;
  if v_estado not in ('planeada'::asignacion_estado, 'surtida'::asignacion_estado) then
    raise exception 'Solo se puede cancelar (con reintegro) una ruta planeada o surtida. Estado actual: %.', v_estado;
  end if;

  select id into v_surtido_id from public.surtidos where asignacion_id = p_asignacion_id limit 1;

  if v_surtido_id is not null then
    with cart as (
      select si.id si_id, si.producto_id, si.encartuchado_id, si.cartuchos_entregados,
             e.gramos_por_cartucho, e.costo_promedio_g
        from public.surtido_items si
        join public.encartuchados e on e.id = si.encartuchado_id
       where si.surtido_id = v_surtido_id and si.cartuchos_entregados > 0
    ), u as (
      update public.encartuchados e
         set cantidad_disponible = e.cantidad_disponible + agg.t
        from (select encartuchado_id, sum(cartuchos_entregados) t from cart group by encartuchado_id) agg
       where e.id = agg.encartuchado_id returning 1
    ), ins as (
      insert into public.movimientos_inventario (
        tipo, producto_id, encartuchado_id, presentacion,
        cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas)
      select 'ajuste_conteo_almacen'::movimiento_tipo, c.producto_id, c.encartuchado_id,
             'cartucho'::mov_presentacion, c.cartuchos_entregados, 0,
             c.cartuchos_entregados * c.gramos_por_cartucho, c.costo_promedio_g,
             round(c.cartuchos_entregados * c.gramos_por_cartucho * c.costo_promedio_g, 2),
             'surtido_items', c.si_id, v_uid,
             'Reintegro por cancelación de ruta surtida · ' || coalesce(p_motivo,'')
        from cart c returning cantidad_cartuchos
    )
    select coalesce(sum(cantidad_cartuchos),0) into v_cart from ins;

    with vasos as (
      select si.id si_id, si.producto_id, si.lote_vaso_id, si.vasos_entregados, l.costo_por_gramo
        from public.surtido_items si
        join public.lotes l on l.id = si.lote_vaso_id
       where si.surtido_id = v_surtido_id and si.vasos_entregados > 0
    ), u as (
      update public.lotes l
         set unidades_disponibles = coalesce(l.unidades_disponibles,0) + agg.t
        from (select lote_vaso_id, sum(vasos_entregados) t from vasos group by lote_vaso_id) agg
       where l.id = agg.lote_vaso_id returning 1
    ), ins as (
      insert into public.movimientos_inventario (
        tipo, producto_id, presentacion,
        cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas)
      select 'ajuste_conteo_almacen'::movimiento_tipo, v.producto_id, 'vaso'::mov_presentacion,
             0, v.vasos_entregados, 0, v.costo_por_gramo,
             round(v.vasos_entregados * coalesce(v.costo_por_gramo,0),2),
             'surtido_items', v.si_id, v_uid,
             'Reintegro vasos por cancelación de ruta surtida · ' || coalesce(p_motivo,'')
        from vasos v returning cantidad_vasos
    )
    select coalesce(sum(cantidad_vasos),0) into v_vasos from ins;
  end if;

  perform set_config('app.allow_estado_regression', 'on', true);
  update public.asignaciones_diarias
     set estado = 'cancelada'::asignacion_estado,
         motivo_cierre_incompleto = coalesce(p_motivo, 'Ruta cancelada, surtido reintegrado al almacén.')
   where id = p_asignacion_id;
  perform set_config('app.allow_estado_regression', 'off', true);

  return jsonb_build_object('cartuchos_reintegrados', v_cart, 'vasos_reintegrados', v_vasos);
end;
$$;

grant execute on function public.cancelar_ruta_surtida(uuid, text, uuid) to authenticated;


create or replace function public.cerrar_jornadas_pendientes_fin_de_dia()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_asig record;
  v_hoy_cdmx date := (now() at time zone 'America/Mexico_City')::date;
  v_cerradas int := 0;
  v_canceladas_surtida int := 0;
  v_devoluciones int := 0;
  v_total_devs int;
  v_sistema uuid := 'b16c8e99-9dba-4694-82cb-a125491e7d9a';
begin
  for v_asig in
    select a.id, a.operador_id from public.asignaciones_diarias a
     where a.estado = 'en_jornada'::asignacion_estado and a.fecha < v_hoy_cdmx
  loop
    perform set_config('app.allow_estado_regression', 'on', true);
    update public.check_ins set fecha_salida = now(), cierre_forzado = true
     where asignacion_id = v_asig.id and fecha_salida is null;
    with ins_cart as (
      insert into public.devoluciones_almacen (
        surtido_item_id, asignacion_id, maquina_id, operador_id, producto_id,
        encartuchado_id, llenado_item_id, cantidad_calculada, estado, notas)
      select si.id, v_asig.id, si.maquina_id, v_asig.operador_id, si.producto_id,
             si.encartuchado_id, null, si.cartuchos_entregados,
             'pendiente_devolucion'::devolucion_estado, 'Auto-generada por cierre automático fin de día'
        from public.surtidos s join public.surtido_items si on si.surtido_id = s.id
       where s.asignacion_id = v_asig.id and si.cartuchos_entregados > 0
         and not exists (select 1 from public.check_ins ci where ci.asignacion_id = v_asig.id and ci.maquina_id = si.maquina_id)
      returning 1)
    select count(*) into v_total_devs from ins_cart;
    v_devoluciones := v_devoluciones + v_total_devs;
    with ins_vasos as (
      insert into public.devoluciones_almacen (
        surtido_item_id, asignacion_id, maquina_id, operador_id, producto_id,
        encartuchado_id, llenado_item_id, cantidad_calculada, estado, notas)
      select si.id, v_asig.id, si.maquina_id, v_asig.operador_id, si.producto_id,
             null, null, si.vasos_entregados,
             'pendiente_devolucion'::devolucion_estado, 'Auto-generada por cierre automático fin de día · VASOS'
        from public.surtidos s join public.surtido_items si on si.surtido_id = s.id
       where s.asignacion_id = v_asig.id and si.vasos_entregados > 0
         and not exists (select 1 from public.check_ins ci where ci.asignacion_id = v_asig.id and ci.maquina_id = si.maquina_id)
      returning 1)
    select count(*) into v_total_devs from ins_vasos;
    v_devoluciones := v_devoluciones + v_total_devs;
    update public.asignaciones_diarias
       set estado = 'completada_parcialmente'::asignacion_estado,
           motivo_cierre_incompleto = 'Cierre automático fin de día'
     where id = v_asig.id;
    perform set_config('app.allow_estado_regression', 'off', true);
    v_cerradas := v_cerradas + 1;
  end loop;

  for v_asig in
    select a.id from public.asignaciones_diarias a
     where a.estado in ('surtida'::asignacion_estado, 'planeada'::asignacion_estado)
       and a.fecha < v_hoy_cdmx
  loop
    perform public.cancelar_ruta_surtida(
      v_asig.id, 'Cancelación automática fin de día: la ruta no se ejecutó.', v_sistema);
    v_canceladas_surtida := v_canceladas_surtida + 1;
  end loop;

  return jsonb_build_object(
    'fecha_cdmx', v_hoy_cdmx,
    'en_jornada_cerradas', v_cerradas,
    'surtidas_canceladas', v_canceladas_surtida,
    'devoluciones_generadas', v_devoluciones,
    'ejecutado_at', now());
end;
$$;
