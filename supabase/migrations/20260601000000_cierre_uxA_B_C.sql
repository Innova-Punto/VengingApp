-- ============================================================================
-- 46 · Mejoras de UX del cierre
--   A. PesajeForm muestra cierre objetivo (cambio de UI, sin migración)
--   B. abrir_cierre_mensual falla si hay cierre anterior abierto/en_proceso
--      (con p_force=true para excepciones)
--   C. RPC actualizar_pesaje_tolva_item: admin/dirección puede corregir
--      gramos_medidos de un pesaje mientras el cierre no esté cerrado.
--      Ajusta la tolva, registra un kardex de corrección y recalcula
--      diferencia_porcentaje, valor_diferencia y alerta_generada.
-- ============================================================================

-- B. abrir_cierre_mensual: validar que no haya otros cierres no cerrados
create or replace function public.abrir_cierre_mensual(
  p_mes int,
  p_anio int,
  p_force boolean default false
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_snap record;
  v_anterior record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'Solo admin o dirección pueden abrir cierres';
  end if;
  if p_mes < 1 or p_mes > 12 then raise exception 'Mes inválido'; end if;
  if p_anio < 2024 or p_anio > 2100 then raise exception 'Año inválido'; end if;

  -- Si ya existe el cierre del mes solicitado, regresa su id
  select id into v_id from public.cierres_mensuales
    where periodo_mes = p_mes and periodo_anio = p_anio;
  if v_id is not null then return v_id; end if;

  -- Bloqueo: hay un cierre previo no cerrado
  if not p_force then
    select periodo_mes, periodo_anio, estado into v_anterior
      from public.cierres_mensuales
     where estado in ('abierto'::cierre_estado, 'en_proceso'::cierre_estado)
       and (periodo_anio < p_anio or (periodo_anio = p_anio and periodo_mes < p_mes))
     order by periodo_anio desc, periodo_mes desc
     limit 1;
    if v_anterior.estado is not null then
      raise exception
        'Hay un cierre anterior sin cerrar (% / %, estado: %). Ciérralo primero o usa cierre forzado.',
        lpad(v_anterior.periodo_mes::text, 2, '0'), v_anterior.periodo_anio, v_anterior.estado;
    end if;
  end if;

  select * into v_snap from public._snapshot_inventario_mxn();

  insert into public.cierres_mensuales (
    periodo_mes, periodo_anio, estado, fecha_inicio_cierre,
    gramos_almacen_inicio, valor_almacen_inicio,
    gramos_maquinas_inicio, valor_maquinas_inicio
  ) values (
    p_mes, p_anio, 'abierto'::cierre_estado, now(),
    v_snap.gramos_almacen, v_snap.valor_almacen,
    v_snap.gramos_maquinas, v_snap.valor_maquinas
  ) returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.abrir_cierre_mensual(int, int, boolean) to authenticated;

-- C. RPC para corregir un gramos_medidos ya capturado
create or replace function public.actualizar_pesaje_tolva_item(
  p_item_id uuid,
  p_gramos_medidos int,
  p_notas text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_item record;
  v_pesaje record;
  v_cierre_estado cierre_estado;
  v_delta int;
  v_diferencia_nueva int;
  v_diferencia_pct numeric(8,2);
  v_valor_nuevo numeric(14,2);
  v_alerta boolean;
  v_costo numeric(12,6);
  v_producto_id uuid;
  v_inventario_anterior int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'Solo admin o dirección pueden corregir pesajes';
  end if;
  if p_gramos_medidos < 0 then raise exception 'gramos_medidos debe ser >= 0'; end if;

  select * into v_item from public.pesaje_tolva_items where id = p_item_id for update;
  if v_item is null then raise exception 'Pesaje no encontrado'; end if;

  select pm.*, cm.estado as cierre_estado into v_pesaje
    from public.pesajes_maquina pm
    join public.cierres_mensuales cm on cm.id = pm.cierre_id
   where pm.id = v_item.pesaje_id;

  if v_pesaje.cierre_estado = 'cerrado'::cierre_estado then
    raise exception 'No se puede editar un pesaje de un cierre ya cerrado.';
  end if;

  v_delta := p_gramos_medidos - v_item.gramos_medidos;

  if v_delta = 0 then
    update public.pesaje_tolva_items
       set notas = coalesce(p_notas, notas)
     where id = p_item_id;
    return;
  end if;

  -- Lee inventario actual de tolva y costo
  select inventario_actual_g, costo_promedio_g_actual, producto_id
    into v_inventario_anterior, v_costo, v_producto_id
    from public.tolvas where id = v_item.tolva_id for update;

  -- Recalcula diferencias contra teorico (no cambia)
  v_diferencia_nueva := p_gramos_medidos - v_item.gramos_teoricos;
  v_diferencia_pct := case when v_item.gramos_teoricos > 0
    then round(v_diferencia_nueva::numeric / v_item.gramos_teoricos * 100, 2)
    else null end;
  v_valor_nuevo := round(v_diferencia_nueva * coalesce(v_costo, 0), 2);
  v_alerta := abs(coalesce(v_diferencia_pct, 0)) >= 5;

  -- Actualiza el item (diferencia_gramos es GENERATED, no se asigna)
  update public.pesaje_tolva_items
     set gramos_medidos = p_gramos_medidos,
         diferencia_porcentaje = v_diferencia_pct,
         valor_diferencia = v_valor_nuevo,
         alerta_generada = v_alerta,
         notas = coalesce(
           p_notas,
           coalesce(notas, '') ||
           format(' · Corregido de %s g a %s g por admin', v_item.gramos_medidos, p_gramos_medidos)
         )
   where id = p_item_id;

  -- Ajusta la tolva con el delta (= nuevo - viejo)
  update public.tolvas
     set inventario_actual_g = greatest(0, v_inventario_anterior + v_delta)
   where id = v_item.tolva_id;

  -- Kardex compensatorio (ajuste_conteo_maquina por el delta)
  if v_producto_id is not null then
    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id, tolva_id,
      presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, notas
    ) values (
      'ajuste_conteo_maquina'::movimiento_tipo,
      v_producto_id, v_pesaje.maquina_id, v_item.tolva_id,
      'polvo_en_tolva'::mov_presentacion,
      0, 0, v_delta,
      coalesce(v_costo, 0),
      round(v_delta * coalesce(v_costo, 0), 2),
      'pesaje_tolva_items', p_item_id, v_uid,
      format('Corrección de pesaje (admin): de %s g a %s g', v_item.gramos_medidos, p_gramos_medidos)
    );
  end if;
end;
$$;
grant execute on function public.actualizar_pesaje_tolva_item(uuid, int, text) to authenticated;
