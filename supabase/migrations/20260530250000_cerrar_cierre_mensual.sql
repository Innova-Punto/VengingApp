-- ============================================================================
-- 37 · Cerrar cierre mensual
--   Marca el cierre como 'cerrado' con snapshot básico de máquinas pesadas
--   y total de máquinas activas en el periodo.
--   En v1 no bloquea físicamente movimientos posteriores con fecha del mes
--   cerrado (eso sería con triggers de tabla); confiamos en proceso.
-- ============================================================================

create or replace function public.cerrar_cierre_mensual(
  p_cierre_id uuid,
  p_force boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_cierre record;
  v_total_maquinas int;
  v_maquinas_pesadas int;
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

  if not v_cierre.conteo_almacen_completado and not p_force then
    raise exception 'Falta el conteo de almacén. Aplícalo primero o usa la opción de cierre forzado.';
  end if;

  select count(distinct id) into v_total_maquinas
    from public.maquinas
   where activo = true
     and estado <> 'baja';

  select count(distinct maquina_id) into v_maquinas_pesadas
    from public.pesajes_maquina
   where cierre_id = p_cierre_id;

  update public.cierres_mensuales
     set estado = 'cerrado'::cierre_estado,
         fecha_cierre = now(),
         cerrado_por = v_uid,
         total_maquinas_periodo = v_total_maquinas,
         maquinas_pesadas = v_maquinas_pesadas
   where id = p_cierre_id;

  return p_cierre_id;
end;
$$;

revoke all on function public.cerrar_cierre_mensual(uuid, boolean) from public;
grant execute on function public.cerrar_cierre_mensual(uuid, boolean) to authenticated;
