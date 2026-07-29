-- ============================================================================
-- 96 · Idempotencia en cancelar_ruta_surtida (evita reintegro doble)
--
-- La función validaba el estado al inicio pero reintegraba ANTES de marcar la
-- asignación como 'cancelada'. Si se ejecutaba dos veces (reintento, o la ruta
-- volvía a estado cancelable entre llamadas), reintegraba el surtido dos veces
-- e inflaba el almacén (caso café SUR-000158 el 27-jul: reintegro doble que
-- borró la salida real de la ruta de emergencia de Salvador).
--
-- Fix: (a) bloqueo de fila (FOR UPDATE) para serializar llamadas concurrentes;
--      (b) guardia de datos: si el surtido YA tiene reintegro, no repetirlo.
-- ============================================================================
create or replace function public.cancelar_ruta_surtida(p_asignacion_id uuid, p_motivo text, p_uid uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := coalesce(p_uid, auth.uid());
  v_estado asignacion_estado;
  v_cart int := 0;
  v_vasos int := 0;
  v_surtido_id uuid;
  v_ya_reintegrado boolean := false;
begin
  if p_uid is null then
    if v_uid is null then raise exception 'No autenticado'; end if;
    if not (user_has_role('admin'::app_role)
         or user_has_role('direccion'::app_role)
         or user_has_role('planeador'::app_role)) then
      raise exception 'Solo admin, dirección o planeador pueden cancelar rutas surtidas.';
    end if;
  end if;

  -- Bloqueo de fila: serializa llamadas concurrentes (doble clic / reintento).
  select estado into v_estado
    from public.asignaciones_diarias where id = p_asignacion_id for update;
  if v_estado is null then raise exception 'Asignación no encontrada'; end if;
  if v_estado not in ('planeada'::asignacion_estado, 'surtida'::asignacion_estado) then
    raise exception 'Solo se puede cancelar (con reintegro) una ruta planeada o surtida. Estado actual: %.', v_estado;
  end if;

  select id into v_surtido_id from public.surtidos where asignacion_id = p_asignacion_id limit 1;

  -- Guardia de idempotencia: ¿ya se reintegró este surtido antes?
  if v_surtido_id is not null then
    select exists (
      select 1 from public.movimientos_inventario mi
       join public.surtido_items si on si.id = mi.referencia_id
      where si.surtido_id = v_surtido_id
        and mi.tipo = 'ajuste_conteo_almacen'::movimiento_tipo
        and mi.notas ilike 'Reintegro%cancelaci%'
    ) into v_ya_reintegrado;
  end if;

  if v_surtido_id is not null and not v_ya_reintegrado then
    -- Cartuchos → encartuchados
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

    -- Vasos → lote
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

  -- Cancelar asignación (bypass del state machine)
  perform set_config('app.allow_estado_regression', 'on', true);
  update public.asignaciones_diarias
     set estado = 'cancelada'::asignacion_estado,
         motivo_cierre_incompleto = coalesce(p_motivo, 'Ruta cancelada, surtido reintegrado al almacén.')
   where id = p_asignacion_id;
  perform set_config('app.allow_estado_regression', 'off', true);

  return jsonb_build_object('cartuchos_reintegrados', v_cart, 'vasos_reintegrados', v_vasos,
                            'ya_reintegrado', v_ya_reintegrado);
end;
$function$;
