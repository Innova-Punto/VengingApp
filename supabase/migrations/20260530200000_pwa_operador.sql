-- ============================================================================
-- 32 · PWA Operador
--   RLS para que el rol `operador` pueda crear sus propias jornadas, check-ins
--   e incidencias. Llenados y movimientos críticos van vía RPC para
--   garantizar atomicidad (snapshot inventario, kardex, devoluciones).
--   Buckets de Storage para evidencias (privados, signed URLs).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RLS: jornadas
-- ----------------------------------------------------------------------------

create policy jornadas_operador_insert on public.jornadas
  for insert to authenticated
  with check (
    user_has_role('operador'::app_role)
    and operador_id = auth.uid()
  );

create policy jornadas_operador_update on public.jornadas
  for update to authenticated
  using (operador_id = auth.uid())
  with check (operador_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RLS: check_ins
-- ----------------------------------------------------------------------------

create policy check_ins_operador_insert on public.check_ins
  for insert to authenticated
  with check (
    user_has_role('operador'::app_role)
    and operador_id = auth.uid()
  );

create policy check_ins_operador_update on public.check_ins
  for update to authenticated
  using (operador_id = auth.uid())
  with check (operador_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RLS: incidencias
-- ----------------------------------------------------------------------------

create policy incidencias_operador_insert on public.incidencias
  for insert to authenticated
  with check (
    user_has_role('operador'::app_role)
    and operador_id = auth.uid()
  );

-- Llenados y llenado_items NO se abren al operador: van vía RPC.

-- ============================================================================
-- RPC: op_iniciar_jornada
--   Idempotente. Crea jornada si no existe para la asignación. Marca la
--   asignación como 'en_jornada' si estaba 'surtida'.
-- ============================================================================

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
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select operador_id into v_operador_id
    from public.asignaciones_diarias
   where id = p_asignacion_id;

  if v_operador_id is null then
    raise exception 'Asignación no encontrada';
  end if;

  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para esta asignación';
  end if;

  select id into v_jornada_id
    from public.jornadas
   where asignacion_id = p_asignacion_id;

  if v_jornada_id is not null then
    return v_jornada_id;
  end if;

  insert into public.jornadas (asignacion_id, operador_id, lat_inicio, lng_inicio)
  values (p_asignacion_id, v_operador_id, p_lat, p_lng)
  returning id into v_jornada_id;

  update public.asignaciones_diarias
     set estado = 'en_jornada'
   where id = p_asignacion_id
     and estado = 'surtida';

  return v_jornada_id;
end;
$$;

revoke all on function public.op_iniciar_jornada(uuid, numeric, numeric) from public;
grant execute on function public.op_iniciar_jornada(uuid, numeric, numeric) to authenticated;

-- ============================================================================
-- RPC: op_check_in
--   Idempotente: si ya existe check-in para esa asignación+máquina, lo regresa.
-- ============================================================================

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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_check_in_id uuid;
  v_operador_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select operador_id into v_operador_id
    from public.asignaciones_diarias
   where id = p_asignacion_id;

  if v_operador_id is null then
    raise exception 'Asignación no encontrada';
  end if;

  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para esta asignación';
  end if;

  select id into v_check_in_id
    from public.check_ins
   where asignacion_id = p_asignacion_id
     and maquina_id = p_maquina_id;

  if v_check_in_id is not null then
    return v_check_in_id;
  end if;

  insert into public.check_ins (
    asignacion_id, maquina_id, operador_id,
    metodo, lat, lng, precision_m, foto_evidencia_url, notas
  ) values (
    p_asignacion_id, p_maquina_id, v_operador_id,
    p_metodo, p_lat, p_lng, p_precision_m, p_foto_url, p_notas
  ) returning id into v_check_in_id;

  return v_check_in_id;
end;
$$;

revoke all on function public.op_check_in(uuid, uuid, checkin_metodo, numeric, numeric, numeric, text, text) from public;
grant execute on function public.op_check_in(uuid, uuid, checkin_metodo, numeric, numeric, numeric, text, text) to authenticated;

-- ============================================================================
-- RPC: op_registrar_llenado
--   Operación atómica:
--     1. Crea llenados (1 por check-in)
--     2. Por cada item del payload:
--        - Snapshot tolva (inventario_g y costo_promedio_g_actual antes)
--        - Inserta llenado_items
--        - Actualiza tolva (inventario + costo promedio ponderado)
--        - Inserta movimientos_inventario tipo llenado_entrada_tolva
--        - Si quedan cartuchos sin usar (planeado > cargado), crea
--          devoluciones_almacen pendiente
--     3. Cierra check-in (fecha_salida, tiempo_en_sitio)
--
--   p_items: jsonb array de {tolva_id, surtido_item_id, cartuchos_cargados}
-- ============================================================================

create or replace function public.op_registrar_llenado(
  p_check_in_id uuid,
  p_items jsonb,
  p_evidencia_url text default null,
  p_notas text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_llenado_id uuid;
  v_maquina_id uuid;
  v_operador_id uuid;
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_tolva_id uuid;
  v_surtido_item_id uuid;
  v_cartuchos_cargados int;
  v_cartuchos_planeados int;
  v_cartuchos_no_usados int;
  v_encartuchado_id uuid;
  v_producto_id uuid;
  v_gramos_por_cartucho int;
  v_costo_g numeric(12,6);
  v_inv_antes int;
  v_costo_antes numeric(12,6);
  v_inv_despues int;
  v_costo_despues numeric(12,6);
  v_gramos_cargados int;
  v_llenado_item_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select maquina_id, operador_id into v_maquina_id, v_operador_id
    from public.check_ins where id = p_check_in_id;

  if v_maquina_id is null then
    raise exception 'Check-in no encontrado';
  end if;

  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para este check-in';
  end if;

  -- Crea llenado (unique check_in_id; si ya existe, falla)
  insert into public.llenados (check_in_id, maquina_id, operador_id, evidencia_url, notas)
  values (p_check_in_id, v_maquina_id, v_operador_id, p_evidencia_url, p_notas)
  returning id into v_llenado_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_tolva_id := (v_item->>'tolva_id')::uuid;
    v_surtido_item_id := (v_item->>'surtido_item_id')::uuid;
    v_cartuchos_cargados := coalesce((v_item->>'cartuchos_cargados')::int, 0);

    if v_cartuchos_cargados < 0 then
      raise exception 'cartuchos_cargados debe ser >= 0';
    end if;

    select cartuchos_entregados, encartuchado_id
      into v_cartuchos_planeados, v_encartuchado_id
      from public.surtido_items where id = v_surtido_item_id;

    if v_encartuchado_id is null then
      raise exception 'Surtido item % no tiene encartuchado asignado (PEPS no aplicado)', v_surtido_item_id;
    end if;

    if v_cartuchos_cargados > v_cartuchos_planeados then
      raise exception 'No puede cargar % cartuchos: el surtido planeó solo %', v_cartuchos_cargados, v_cartuchos_planeados;
    end if;

    select gramos_por_cartucho, costo_promedio_g, producto_id
      into v_gramos_por_cartucho, v_costo_g, v_producto_id
      from public.encartuchados where id = v_encartuchado_id;

    v_gramos_cargados := v_cartuchos_cargados * v_gramos_por_cartucho;
    v_cartuchos_no_usados := v_cartuchos_planeados - v_cartuchos_cargados;

    select inventario_actual_g, costo_promedio_g_actual
      into v_inv_antes, v_costo_antes
      from public.tolvas where id = v_tolva_id;

    v_inv_despues := v_inv_antes + v_gramos_cargados;
    if v_inv_despues > 0 then
      v_costo_despues :=
        (v_inv_antes * v_costo_antes + v_gramos_cargados * v_costo_g)
        / v_inv_despues;
    else
      v_costo_despues := 0;
    end if;

    insert into public.llenado_items (
      llenado_id, tolva_id, surtido_item_id,
      cartuchos_planeados, cartuchos_cargados,
      gramos_cargados, encartuchado_id,
      inventario_tolva_antes, inventario_tolva_despues,
      costo_promedio_g_tolva_antes, costo_promedio_g_tolva_despues
    ) values (
      v_llenado_id, v_tolva_id, v_surtido_item_id,
      v_cartuchos_planeados, v_cartuchos_cargados,
      v_gramos_cargados, v_encartuchado_id,
      v_inv_antes, v_inv_despues,
      v_costo_antes, v_costo_despues
    ) returning id into v_llenado_item_id;

    update public.tolvas set
      inventario_actual_g = v_inv_despues,
      costo_promedio_g_actual = v_costo_despues,
      ultimo_llenado_at = now()
    where id = v_tolva_id;

    if v_gramos_cargados > 0 then
      insert into public.movimientos_inventario (
        tipo, producto_id, encartuchado_id, maquina_id, tolva_id,
        presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id
      ) values (
        'llenado_entrada_tolva'::movimiento_tipo,
        v_producto_id, v_encartuchado_id, v_maquina_id, v_tolva_id,
        'polvo_en_tolva'::mov_presentacion,
        v_cartuchos_cargados, 0, v_gramos_cargados,
        v_costo_g,
        round(v_gramos_cargados * v_costo_g, 2),
        'llenado_items', v_llenado_item_id, v_uid
      );
    end if;

    if v_cartuchos_no_usados > 0 then
      insert into public.devoluciones_almacen (
        llenado_item_id, operador_id,
        producto_id, encartuchado_id,
        cantidad_calculada, estado
      ) values (
        v_llenado_item_id, v_operador_id,
        v_producto_id, v_encartuchado_id,
        v_cartuchos_no_usados,
        'pendiente_devolucion'::devolucion_estado
      );
    end if;
  end loop;

  update public.check_ins set
    fecha_salida = now(),
    tiempo_en_sitio_seg = extract(epoch from (now() - fecha_entrada))::int
  where id = p_check_in_id;

  return v_llenado_id;
end;
$$;

revoke all on function public.op_registrar_llenado(uuid, jsonb, text, text) from public;
grant execute on function public.op_registrar_llenado(uuid, jsonb, text, text) to authenticated;

-- ============================================================================
-- Buckets de Storage para evidencias
--   Todos privados. Acceso vía signed URLs.
--   El operador (y admin/direccion) puede insertar; cualquier autenticado lee.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('evidencias-checkin', 'evidencias-checkin', false),
  ('evidencias-llenado', 'evidencias-llenado', false),
  ('evidencias-incidencias', 'evidencias-incidencias', false),
  ('evidencias-jornada', 'evidencias-jornada', false)
on conflict (id) do nothing;

create policy "evidencias_operador_insert"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id in (
      'evidencias-checkin',
      'evidencias-llenado',
      'evidencias-incidencias',
      'evidencias-jornada'
    )
    and (
      user_has_role('operador'::app_role)
      or user_has_role('admin'::app_role)
      or user_has_role('direccion'::app_role)
    )
  );

create policy "evidencias_authenticated_read"
  on storage.objects
  for select to authenticated
  using (
    bucket_id in (
      'evidencias-checkin',
      'evidencias-llenado',
      'evidencias-incidencias',
      'evidencias-jornada'
    )
  );
