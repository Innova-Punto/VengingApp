-- Fix: las funciones fn_asignacion_estado_machine y reabrir_ruta tenían
-- literales 'completada_incompleta' que quedaron rotos después del rename
-- del enum a 'completada_parcialmente'. Esto rompía cualquier UPDATE de
-- estado en asignaciones (el state machine fallaba con "invalid input
-- value for enum"). Recreamos ambas con el nombre nuevo.

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

    if OLD.estado = 'completada_parcialmente'::asignacion_estado
       and NEW.estado <> 'completada_parcialmente'::asignacion_estado
       and NEW.estado <> 'cancelada'::asignacion_estado
    then
      raise exception 'No se puede modificar una asignación completada parcialmente. Usa "Reabrir ruta" si necesitas hacerlo.';
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
       'completada_parcialmente'::asignacion_estado
     ) then
    raise exception 'Solo se puede reabrir una asignación en jornada, completada o completada parcialmente (estado actual: %).', v_estado;
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
