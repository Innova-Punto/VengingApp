-- ============================================================================
-- 99 · RPC op_registrar_servicio
--
-- Registra la visita de servicio de una máquina tipo 'servicio' de forma
-- atómica: valida el check-in del operador, valida que el checklist esté
-- completo (todos los items obligatorios respondidos; los "mal" con
-- descripción), inserta servicio_visitas + servicio_respuestas y cierra el
-- check-in (fecha_salida). Mismo patrón que op_registrar_llenado.
-- ============================================================================

create or replace function public.op_registrar_servicio(
  p_check_in_id uuid,
  p_plantilla_id uuid,
  p_respuestas jsonb,               -- [{item_id, estado, descripcion, foto_url}]
  p_inventario_sf text default null,
  p_producto_repuesto boolean default false,
  p_cantidad_repuesta int default null,
  p_foto_general_url text default null,
  p_lider_nombre text default null,
  p_firma_url text default null,
  p_firma_no_disponible boolean default false,
  p_firma_motivo text default null,
  p_observaciones text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_maquina_id uuid;
  v_operador_id uuid;
  v_tipo text;
  v_visita_id uuid;
  v_r jsonb;
  v_item_id uuid;
  v_estado text;
  v_descripcion text;
  v_obligatorios int;
  v_respondidos int;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select ci.maquina_id, ci.operador_id, m.tipo
    into v_maquina_id, v_operador_id, v_tipo
    from public.check_ins ci
    join public.maquinas m on m.id = ci.maquina_id
   where ci.id = p_check_in_id;

  if v_maquina_id is null then
    raise exception 'Check-in no encontrado';
  end if;
  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para este check-in';
  end if;
  if v_tipo <> 'servicio' then
    raise exception 'Esta máquina no es de tipo servicio';
  end if;
  if exists (select 1 from public.servicio_visitas where check_in_id = p_check_in_id) then
    raise exception 'Esta visita ya tiene un servicio registrado';
  end if;

  -- Checklist completo: todos los items obligatorios de la plantilla deben
  -- venir respondidos con bien/mal/na.
  select count(*) into v_obligatorios
    from public.checklist_items
   where plantilla_id = p_plantilla_id and obligatorio;

  select count(distinct ci.id) into v_respondidos
    from jsonb_array_elements(p_respuestas) r
    join public.checklist_items ci
      on ci.id = (r->>'item_id')::uuid
     and ci.plantilla_id = p_plantilla_id
     and ci.obligatorio
   where r->>'estado' in ('bien','mal','na');

  if v_respondidos < v_obligatorios then
    raise exception 'Checklist incompleto: faltan % puntos por responder',
      v_obligatorios - v_respondidos;
  end if;

  insert into public.servicio_visitas (
    check_in_id, maquina_id, plantilla_id, operador_id,
    inventario_sf, producto_repuesto, cantidad_repuesta,
    foto_general_url, lider_nombre, firma_url,
    firma_no_disponible, firma_motivo, observaciones
  ) values (
    p_check_in_id, v_maquina_id, p_plantilla_id, v_operador_id,
    p_inventario_sf, coalesce(p_producto_repuesto, false), p_cantidad_repuesta,
    p_foto_general_url, p_lider_nombre, p_firma_url,
    coalesce(p_firma_no_disponible, false), p_firma_motivo, p_observaciones
  ) returning id into v_visita_id;

  for v_r in select * from jsonb_array_elements(p_respuestas)
  loop
    v_item_id := (v_r->>'item_id')::uuid;
    v_estado := nullif(v_r->>'estado', '');
    v_descripcion := nullif(trim(coalesce(v_r->>'descripcion','')), '');

    if v_estado is not null and v_estado not in ('bien','mal','na') then
      raise exception 'Estado inválido: %', v_estado;
    end if;
    if v_estado = 'mal' and v_descripcion is null then
      raise exception 'Los puntos marcados MAL requieren descripción';
    end if;

    insert into public.servicio_respuestas (visita_id, item_id, estado, descripcion, foto_url, valor)
    values (
      v_visita_id, v_item_id, v_estado, v_descripcion,
      nullif(v_r->>'foto_url',''), nullif(v_r->>'valor','')
    );
  end loop;

  update public.check_ins set
    fecha_salida = now(),
    tiempo_en_sitio_seg = extract(epoch from (now() - fecha_entrada))::int
  where id = p_check_in_id;

  return v_visita_id;
end;
$$;

revoke all on function public.op_registrar_servicio(uuid, uuid, jsonb, text, boolean, int, text, text, text, boolean, text, text) from public;
grant execute on function public.op_registrar_servicio(uuid, uuid, jsonb, text, boolean, int, text, text, text, boolean, text, text) to authenticated;
