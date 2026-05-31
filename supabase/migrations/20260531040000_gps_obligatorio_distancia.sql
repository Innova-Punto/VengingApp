-- ============================================================================
-- 44 · GPS obligatorio + validación de distancia + pesaje obligatorio
--
-- - Función distancia_metros (fórmula de haversine) reutilizable.
-- - op_check_in ahora requiere lat/lng y valida que el operador esté a
--   ≤100m de la ubicación de la máquina (si tiene coordenadas). Admin y
--   dirección pueden saltarse la validación.
-- ============================================================================

create or replace function public.distancia_metros(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  r numeric := 6371000;
  phi1 numeric; phi2 numeric; dphi numeric; dlambda numeric;
  a numeric; c numeric;
begin
  if lat1 is null or lng1 is null or lat2 is null or lng2 is null then
    return null;
  end if;
  phi1 := radians(lat1);
  phi2 := radians(lat2);
  dphi := radians(lat2 - lat1);
  dlambda := radians(lng2 - lng1);
  a := power(sin(dphi/2), 2) + cos(phi1) * cos(phi2) * power(sin(dlambda/2), 2);
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  return round(r * c, 2);
end;
$$;
grant execute on function public.distancia_metros(numeric, numeric, numeric, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- op_check_in: lat/lng obligatorios + validación de distancia a 100m
-- ----------------------------------------------------------------------------

create or replace function public.op_check_in(
  p_asignacion_id uuid,
  p_maquina_id uuid,
  p_metodo checkin_metodo default 'manual_supervisado'::checkin_metodo,
  p_lat numeric default null,
  p_lng numeric default null,
  p_precision_m numeric default null,
  p_foto_url text default null,
  p_notas text default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_check_in_id uuid;
  v_operador_id uuid;
  v_uid uuid := auth.uid();
  v_ubic_lat numeric;
  v_ubic_lng numeric;
  v_dist numeric;
  v_es_admin boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  if p_lat is null or p_lng is null then
    raise exception 'GPS obligatorio: activa la ubicación del celular y vuelve a intentar.';
  end if;

  select operador_id into v_operador_id from public.asignaciones_diarias where id = p_asignacion_id;
  if v_operador_id is null then raise exception 'Asignación no encontrada'; end if;

  v_es_admin := user_has_role('admin'::app_role) or user_has_role('direccion'::app_role);

  if v_operador_id <> v_uid and not v_es_admin then
    raise exception 'No autorizado para esta asignación';
  end if;

  -- Validar distancia (solo operador, admin/dir se saltan)
  select u.lat, u.lng into v_ubic_lat, v_ubic_lng
    from public.maquinas m
    join public.ubicaciones u on u.id = m.ubicacion_id
   where m.id = p_maquina_id;

  if v_ubic_lat is not null and v_ubic_lng is not null and not v_es_admin then
    v_dist := public.distancia_metros(p_lat, p_lng, v_ubic_lat, v_ubic_lng);
    if v_dist is not null and v_dist > 100 then
      raise exception 'Estás a % m de la máquina (máximo permitido: 100 m). Acércate o pide ayuda a dirección.', v_dist::int;
    end if;
  end if;

  -- Idempotente
  select id into v_check_in_id
    from public.check_ins
   where asignacion_id = p_asignacion_id and maquina_id = p_maquina_id;
  if v_check_in_id is not null then return v_check_in_id; end if;

  insert into public.check_ins (
    asignacion_id, maquina_id, operador_id,
    metodo, lat, lng, precision_m, foto_evidencia_url, notas,
    validado
  ) values (
    p_asignacion_id, p_maquina_id, v_operador_id,
    p_metodo, p_lat, p_lng, p_precision_m, p_foto_url, p_notas,
    true
  ) returning id into v_check_in_id;

  return v_check_in_id;
end;
$$;

grant execute on function public.op_check_in(uuid, uuid, checkin_metodo, numeric, numeric, numeric, text, text) to authenticated;
