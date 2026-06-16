-- ============================================================================
-- Cerrar jornada incompleta — el operador da por terminado el día aunque
-- queden máquinas pendientes (lluvia, vehículo, sucursal cerrada, etc.).
-- La asignación queda en estado terminal `completada_incompleta` (distinto
-- de `completada` para no inflar las métricas de completitud) y deja
-- registrado el motivo seleccionado.
--
-- IMPORTANTE: el valor del enum se agrega en una migración separada
-- (asignacion_estado_completada_incompleta_enum) porque Postgres no permite
-- usar un valor de enum recién creado en la misma transacción.
-- ============================================================================

alter table public.asignaciones_diarias
  add column if not exists motivo_cierre_incompleto text;

comment on column public.asignaciones_diarias.motivo_cierre_incompleto is
  'Motivo dado por el operador cuando cerró la ruta sin terminarla (estado completada_incompleta).';


create or replace function public.fn_asignacion_estado_machine()
returns trigger language plpgsql as $$
begin
  if current_setting('app.allow_estado_regression', true) = 'on' then
    return NEW;
  end if;

  if OLD.estado is distinct from NEW.estado then
    if OLD.estado = 'en_jornada'::asignacion_estado
       and NEW.estado in ('planeada'::asignacion_estado, 'surtida'::asignacion_estado)
    then
      raise exception 'No se puede regresar la asignación de en_jornada a %. La jornada ya inició. Usa "Reabrir ruta" si necesitas modificarla.', NEW.estado;
    end if;

    if OLD.estado = 'completada'::asignacion_estado
       and NEW.estado <> 'completada'::asignacion_estado
       and NEW.estado <> 'cancelada'::asignacion_estado
    then
      raise exception 'No se puede modificar una asignación completada. Usa "Reabrir ruta" si necesitas hacerlo.';
    end if;

    if OLD.estado = 'completada_incompleta'::asignacion_estado
       and NEW.estado <> 'completada_incompleta'::asignacion_estado
       and NEW.estado <> 'cancelada'::asignacion_estado
    then
      raise exception 'No se puede modificar una asignación completada_incompleta. Usa "Reabrir ruta" si necesitas hacerlo.';
    end if;

    if OLD.estado = 'cancelada'::asignacion_estado
       and NEW.estado <> 'cancelada'::asignacion_estado
    then
      raise exception 'No se puede reactivar una asignación cancelada.';
    end if;
  end if;

  return NEW;
end;
$$;


create or replace function public.reabrir_ruta(
  p_asignacion_id uuid,
  p_motivo text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_estado asignacion_estado;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role)
       or user_has_role('direccion'::app_role)
       or user_has_role('planeador'::app_role)) then
    raise exception 'Solo admin, dirección o planeador pueden reabrir una ruta.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Debes indicar el motivo de la reapertura (mínimo 3 caracteres).';
  end if;

  select estado into v_estado
    from public.asignaciones_diarias where id = p_asignacion_id;
  if v_estado is null then raise exception 'Asignación no encontrada'; end if;
  if v_estado not in (
       'en_jornada'::asignacion_estado,
       'completada'::asignacion_estado,
       'completada_incompleta'::asignacion_estado
     ) then
    raise exception 'Solo se puede reabrir una asignación en jornada, completada o completada incompleta (estado actual: %).', v_estado;
  end if;

  update public.jornadas
     set cancelada_at = now(),
         cancelada_por = v_uid,
         motivo_cancelacion = p_motivo
   where asignacion_id = p_asignacion_id
     and cancelada_at is null;

  perform set_config('app.allow_estado_regression', 'on', true);
  update public.asignaciones_diarias
     set estado = 'surtida',
         motivo_cierre_incompleto = null
   where id = p_asignacion_id;
  perform set_config('app.allow_estado_regression', 'off', true);
end;
$$;


create or replace function public.op_cerrar_jornada_incompleta(
  p_asignacion_id uuid,
  p_motivo text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_estado asignacion_estado;
  v_operador uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select estado, operador_id into v_estado, v_operador
    from public.asignaciones_diarias where id = p_asignacion_id;
  if v_estado is null then raise exception 'Asignación no encontrada'; end if;

  if v_operador <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para esta asignación';
  end if;

  if v_estado <> 'en_jornada'::asignacion_estado then
    raise exception 'Solo se puede cerrar como incompleta una asignación en jornada (estado actual: %).', v_estado;
  end if;

  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Debes indicar el motivo del cierre incompleto.';
  end if;

  perform set_config('app.allow_estado_regression', 'on', true);

  update public.check_ins
     set fecha_salida = now()
   where asignacion_id = p_asignacion_id
     and fecha_salida is null;

  update public.asignaciones_diarias
     set estado = 'completada_incompleta'::asignacion_estado,
         motivo_cierre_incompleto = trim(p_motivo)
   where id = p_asignacion_id;

  perform set_config('app.allow_estado_regression', 'off', true);
end;
$$;

grant execute on function public.op_cerrar_jornada_incompleta(uuid, text) to authenticated;
