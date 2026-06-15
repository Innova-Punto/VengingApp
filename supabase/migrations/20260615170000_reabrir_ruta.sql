-- ============================================================================
-- 73 · Reabrir ruta
--
-- Permite a admin/dirección/planeador cancelar la jornada activa de una
-- asignación para que el operador deba volver a iniciar jornada y check-in.
-- Conserva todo el histórico (check_ins, llenados, pesajes) marcando la
-- jornada como cancelada (no la borra).
-- ============================================================================

alter table public.jornadas
  add column if not exists cancelada_at      timestamptz,
  add column if not exists cancelada_por     uuid references public.profiles(id),
  add column if not exists motivo_cancelacion text;

comment on column public.jornadas.cancelada_at is
  'Si NOT NULL: la jornada fue cancelada por reabrir-ruta. Las jornadas activas son las que tienen cancelada_at IS NULL.';

create index if not exists jornadas_asignacion_activa_idx
  on public.jornadas (asignacion_id) where cancelada_at is null;


-- op_iniciar_jornada ahora ignora jornadas canceladas y valida estado
create or replace function public.op_iniciar_jornada(
  p_asignacion_id uuid,
  p_lat numeric default null,
  p_lng numeric default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_jornada_id uuid;
  v_operador_id uuid;
  v_uid uuid := auth.uid();
  v_estado asignacion_estado;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select operador_id, estado into v_operador_id, v_estado
    from public.asignaciones_diarias where id = p_asignacion_id;
  if v_operador_id is null then raise exception 'Asignación no encontrada'; end if;
  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para esta asignación';
  end if;
  if v_estado not in ('planeada'::asignacion_estado, 'surtida'::asignacion_estado) then
    raise exception 'La asignación está en estado %, no se puede iniciar.', v_estado;
  end if;

  select id into v_jornada_id from public.jornadas
   where asignacion_id = p_asignacion_id and cancelada_at is null;
  if v_jornada_id is not null then return v_jornada_id; end if;

  insert into public.jornadas (asignacion_id, operador_id, lat_inicio, lng_inicio)
  values (p_asignacion_id, v_operador_id, p_lat, p_lng)
  returning id into v_jornada_id;

  update public.asignaciones_diarias
     set estado = 'en_jornada'
   where id = p_asignacion_id
     and estado in ('planeada'::asignacion_estado, 'surtida'::asignacion_estado);

  return v_jornada_id;
end;
$$;


-- Trigger de máquina de estados con bypass autorizado
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

    if OLD.estado = 'cancelada'::asignacion_estado
       and NEW.estado <> 'cancelada'::asignacion_estado
    then
      raise exception 'No se puede reactivar una asignación cancelada.';
    end if;
  end if;

  return NEW;
end;
$$;


-- RPC reabrir_ruta
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
  if v_estado not in ('en_jornada'::asignacion_estado, 'completada'::asignacion_estado) then
    raise exception 'Solo se puede reabrir una asignación en jornada o completada (estado actual: %).', v_estado;
  end if;

  update public.jornadas
     set cancelada_at = now(),
         cancelada_por = v_uid,
         motivo_cancelacion = p_motivo
   where asignacion_id = p_asignacion_id
     and cancelada_at is null;

  perform set_config('app.allow_estado_regression', 'on', true);
  update public.asignaciones_diarias
     set estado = 'surtida'
   where id = p_asignacion_id;
  perform set_config('app.allow_estado_regression', 'off', true);
end;
$$;

grant execute on function public.reabrir_ruta(uuid, text) to authenticated;
