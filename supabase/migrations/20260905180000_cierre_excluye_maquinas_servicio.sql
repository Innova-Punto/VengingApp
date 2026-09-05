-- ============================================================================
-- El cierre mensual deja de exigir pesaje a las máquinas de servicio
--
-- Bloqueo real (cierre de agosto 2026): `cerrar_cierre_mensual` contaba el
-- universo de máquinas a pesar como "todas las activas que no estén de baja",
-- sin excluir `tipo = 'servicio'`. Las 10 Smart Energy entraban en la cuenta,
-- nunca se pesan —no llevan inventario de polvo de MuscleUp— y el cierre
-- quedaba trabado pidiendo 10 pesajes que no existen ni deben existir.
--
-- Es la regla que ya estaba documentada en CLAUDE.md §4: las máquinas
-- `servicio` no venden y hay que excluirlas de cualquier reporte o validación
-- basada en venta o inventario, o generan falsas alarmas permanentes. Aquí la
-- falsa alarma bloqueaba el cierre contable.
--
-- Estado al aplicar: 82 máquinas activas, 72 sin contar servicio, y las 72 ya
-- estaban pesadas. El cierre estaba completo; solo la validación decía que no.
--
-- Se corrige el universo en los dos lugares que lo calculan (el conteo y la
-- lista de pendientes del mensaje de error). `v_maquinas_pesadas` no necesita
-- filtro: una máquina de servicio nunca genera un renglón en pesajes_maquina.
--
-- Nota: `total_maquinas_periodo` que se guarda en el cierre pasa a ser 72 en
-- vez de 82. Es el número correcto —es el universo pesable— y hace comparables
-- los cierres de aquí en adelante.
-- ============================================================================

create or replace function public.cerrar_cierre_mensual(
  p_cierre_id uuid,
  p_force boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_cierre record;
  v_total_maquinas int;
  v_maquinas_pesadas int;
  v_pendientes_pesaje int;
  v_lista_pendientes text;
  v_snap record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'Solo admin o dirección pueden cerrar el periodo';
  end if;

  select * into v_cierre from public.cierres_mensuales where id = p_cierre_id for update;
  if v_cierre is null then raise exception 'Cierre no encontrado'; end if;
  if v_cierre.estado = 'cerrado'::cierre_estado then
    raise exception 'El cierre ya está cerrado';
  end if;

  -- Universo pesable: se excluyen las de servicio (Smart Energy), que no
  -- llevan inventario de polvo y por lo tanto nunca se pesan.
  select count(distinct m.id) into v_total_maquinas
    from public.maquinas m
   where m.activo = true and m.estado <> 'baja' and m.tipo::text <> 'servicio';
  select count(distinct pm.maquina_id) into v_maquinas_pesadas
    from public.pesajes_maquina pm where pm.cierre_id = p_cierre_id;
  v_pendientes_pesaje := v_total_maquinas - v_maquinas_pesadas;

  if v_pendientes_pesaje > 0 and not p_force then
    select string_agg(m.serie, ', ' order by m.serie) into v_lista_pendientes
      from public.maquinas m
     where m.activo = true and m.estado <> 'baja' and m.tipo::text <> 'servicio'
       and not exists (select 1 from public.pesajes_maquina pm
         where pm.cierre_id = p_cierre_id and pm.maquina_id = m.id);
    raise exception 'Faltan % máquinas por pesar: %. Usa el cierre forzado si quieres avanzar de todos modos.',
      v_pendientes_pesaje, v_lista_pendientes;
  end if;

  if not v_cierre.conteo_almacen_completado and not p_force then
    raise exception 'Falta el conteo de almacén. Aplícalo primero o usa cierre forzado.';
  end if;

  select * into v_snap from public._snapshot_inventario_mxn();

  update public.cierres_mensuales
     set estado = 'cerrado'::cierre_estado, fecha_cierre = now(), cerrado_por = v_uid,
         total_maquinas_periodo = v_total_maquinas, maquinas_pesadas = v_maquinas_pesadas,
         gramos_almacen_fin = v_snap.gramos_almacen, valor_almacen_fin = v_snap.valor_almacen,
         gramos_maquinas_fin = v_snap.gramos_maquinas, valor_maquinas_fin = v_snap.valor_maquinas,
         valor_vasos_almacen_fin = v_snap.valor_vasos_almacen,
         valor_vasos_maquinas_fin = v_snap.valor_vasos_maquinas
   where id = p_cierre_id;

  -- Snapshot FINAL por producto (para desglose por cliente / SKU)
  delete from public.cierre_snapshot_producto where cierre_id = p_cierre_id and momento = 'fin';
  insert into public.cierre_snapshot_producto (
    cierre_id, momento, producto_id,
    alm_granel_gramos, alm_granel_valor,
    alm_cartuchos_unidades, alm_cartuchos_gramos, alm_cartuchos_valor,
    alm_vasos_unidades, alm_vasos_valor,
    maq_polvo_gramos, maq_polvo_valor,
    maq_vasos_unidades, maq_vasos_valor
  )
  select p_cierre_id, 'fin', s.producto_id,
    s.alm_granel_gramos, s.alm_granel_valor,
    s.alm_cartuchos_unidades, s.alm_cartuchos_gramos, s.alm_cartuchos_valor,
    s.alm_vasos_unidades, s.alm_vasos_valor,
    s.maq_polvo_gramos, s.maq_polvo_valor,
    s.maq_vasos_unidades, s.maq_vasos_valor
  from public.snapshot_inventario_por_producto() s;

  return p_cierre_id;
end;
$$;
