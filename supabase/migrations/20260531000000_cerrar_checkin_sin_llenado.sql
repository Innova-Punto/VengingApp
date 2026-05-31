-- ============================================================================
-- 40 · Fix de flujo de campo
--   - op_cerrar_check_in_sin_llenado: cierra el check-in cuando el operador
--     no tiene nada que llenar en la máquina (inspección, incidencia, etc).
--     Dispara el trigger de cierre automático de jornada.
--   - op_iniciar_jornada: ahora transiciona la asignación a 'en_jornada' si
--     viene desde 'surtida' O 'planeada' (antes solo 'surtida'). Esto cubre
--     el caso de iniciar jornada antes de que almacén complete el surtido.
-- ============================================================================

create or replace function public.op_cerrar_check_in_sin_llenado(
  p_check_in_id uuid,
  p_notas text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_operador_id uuid;
  v_salida boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select operador_id, fecha_salida is not null
    into v_operador_id, v_salida
    from public.check_ins where id = p_check_in_id;

  if v_operador_id is null then raise exception 'Check-in no encontrado'; end if;
  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para este check-in';
  end if;
  if v_salida then return p_check_in_id; end if;

  update public.check_ins
     set fecha_salida = now(),
         tiempo_en_sitio_seg = extract(epoch from (now() - fecha_entrada))::int,
         notas = case
           when p_notas is null or p_notas = '' then notas
           else coalesce(notas || ' · ', '') || p_notas
         end
   where id = p_check_in_id;

  return p_check_in_id;
end;
$$;

revoke all on function public.op_cerrar_check_in_sin_llenado(uuid, text) from public;
grant execute on function public.op_cerrar_check_in_sin_llenado(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Fix op_iniciar_jornada: aceptar transición desde 'planeada' o 'surtida'.
-- ----------------------------------------------------------------------------

create or replace function public.op_iniciar_jornada(
  p_asignacion_id uuid,
  p_lat numeric default null,
  p_lng numeric default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jornada_id uuid;
  v_operador_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select operador_id into v_operador_id
    from public.asignaciones_diarias where id = p_asignacion_id;
  if v_operador_id is null then raise exception 'Asignación no encontrada'; end if;
  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para esta asignación';
  end if;

  select id into v_jornada_id from public.jornadas where asignacion_id = p_asignacion_id;
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

grant execute on function public.op_iniciar_jornada(uuid, numeric, numeric) to authenticated;
