-- ============================================================================
-- 74 · Rutas de emergencia + agregar máquina (con surtido o solo visita)
--
-- Necesidad: atender máquinas con falla que NO están en la ruta del operador.
-- Dos mecanismos, un mismo primitivo (agregar máquina como excepción):
--
--   1. ASIGNACIÓN DE EMERGENCIA: una asignacion_diaria sin ruta base
--      (ruta_id NULL, es_emergencia=true). Empieza vacía, se puede crear varias
--      el mismo día y para cualquier operador (en Postgres los NULL son
--      distintos en el UNIQUE (fecha, ruta_id), así que no choca).
--
--   2. AGREGAR MÁQUINA a una asignación activa (ruta normal o emergencia):
--      la mete como origen='agregada_excepcion' y, si se pide, la surte por
--      PEPS de forma atómica (modo 'surtir'); o solo la deja para visita /
--      diagnóstico (modo 'visita', sin cartuchos).
--
-- Permisos: admin, dirección y ALMACÉN. El surtido toca movimientos_inventario
-- (kardex), sobre el que almacén no tiene RLS de escritura, por eso todo va en
-- funciones SECURITY DEFINER con verificación de rol adentro.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas: ruta opcional + bandera de emergencia
-- ----------------------------------------------------------------------------

alter table public.asignaciones_diarias
  alter column ruta_id drop not null;

alter table public.asignaciones_diarias
  add column if not exists es_emergencia boolean not null default false;

comment on column public.asignaciones_diarias.es_emergencia is
  'true = asignación de emergencia (sin ruta base, ruta_id NULL). Puede haber varias por día y operador.';

-- ----------------------------------------------------------------------------
-- 2. Crear una asignación de emergencia (vacía)
-- ----------------------------------------------------------------------------

create or replace function public.crear_asignacion_emergencia(
  p_operador_id uuid,
  p_fecha       date,
  p_notas       text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role)
       or user_has_role('direccion'::app_role)
       or user_has_role('almacen'::app_role)) then
    raise exception 'Solo admin, dirección o almacén pueden crear emergencias.';
  end if;
  if p_operador_id is null then raise exception 'Selecciona el operador.'; end if;
  if p_fecha is null then raise exception 'Selecciona la fecha.'; end if;

  insert into public.asignaciones_diarias (
    fecha, ruta_id, operador_id, estado, es_emergencia, notas, creado_por
  ) values (
    p_fecha, null, p_operador_id, 'planeada'::asignacion_estado, true, p_notas, v_uid
  ) returning id into v_id;

  return v_id;
end;
$fn$;

grant execute on function public.crear_asignacion_emergencia(uuid, date, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Agregar máquina a una asignación activa, con surtido opcional
--    p_modo: 'surtir' (lleva cartuchos por PEPS) | 'visita' (solo diagnóstico)
-- ----------------------------------------------------------------------------

create or replace function public.agregar_maquina_excepcion_surtir(
  p_asignacion_id uuid,
  p_maquina_id    uuid,
  p_modo          text default 'visita',
  p_motivo        excepcion_motivo default 'emergencia',
  p_notas         text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_uid       uuid := auth.uid();
  v_estado    asignacion_estado;
  v_am_id     uuid;
  v_surtido_id uuid;
  v_item_id   uuid;
  v_cartuchos int;
  v_vasos     int;
  v_primario  uuid;
  r record;
  pk record;
  v_enc record;
  v_gramos numeric;
  v_valor  numeric;
  v_maq record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role)
       or user_has_role('direccion'::app_role)
       or user_has_role('almacen'::app_role)) then
    raise exception 'Solo admin, dirección o almacén pueden agregar máquinas de emergencia.';
  end if;
  if p_modo not in ('surtir','visita') then
    raise exception 'Modo inválido (usa surtir o visita).';
  end if;

  select estado into v_estado
    from public.asignaciones_diarias where id = p_asignacion_id for update;
  if v_estado is null then raise exception 'Asignación no encontrada'; end if;
  if v_estado not in ('planeada'::asignacion_estado,
                      'surtida'::asignacion_estado,
                      'en_jornada'::asignacion_estado) then
    raise exception 'No se pueden agregar máquinas a una asignación en estado %.', v_estado;
  end if;

  -- Insertar la máquina como excepción (idempotente)
  select id into v_am_id from public.asignacion_maquinas
   where asignacion_id = p_asignacion_id and maquina_id = p_maquina_id;
  if v_am_id is null then
    insert into public.asignacion_maquinas (
      asignacion_id, maquina_id, orden, origen, motivo_excepcion, notas
    ) values (
      p_asignacion_id, p_maquina_id, 99, 'agregada_excepcion', p_motivo, p_notas
    ) returning id into v_am_id;
  end if;

  if p_modo = 'visita' then
    return v_am_id;
  end if;

  -- ---- modo surtir: asegurar cabecera de surtido de la asignación ----
  select id into v_surtido_id from public.surtidos where asignacion_id = p_asignacion_id;
  if v_surtido_id is null then
    insert into public.surtidos (folio, asignacion_id, creado_por, estado)
    values ('', p_asignacion_id, v_uid, 'pendiente')
    returning id into v_surtido_id;
  end if;

  -- Surtir polvo por cada tolva: llenar al 100% (cartuchos completos)
  for r in
    select t.producto_id,
           coalesce(p.gramaje_cartucho_default, 400) as gramaje,
           greatest(0, coalesce(t.capacidad_max_g, 2000) - coalesce(t.inventario_actual_g, 0)) as espacio
      from public.tolvas t
      join public.productos p on p.id = t.producto_id
     where t.maquina_id = p_maquina_id and t.producto_id is not null
  loop
    v_cartuchos := floor(r.espacio / nullif(r.gramaje, 0));
    if v_cartuchos is null or v_cartuchos <= 0 then continue; end if;

    select id into v_item_id from public.surtido_items
     where surtido_id = v_surtido_id and maquina_id = p_maquina_id and producto_id = r.producto_id;
    if v_item_id is null then
      insert into public.surtido_items (
        surtido_id, maquina_id, producto_id,
        cartuchos_sugeridos, cartuchos_entregados, vasos_sugeridos, vasos_entregados
      ) values (
        v_surtido_id, p_maquina_id, r.producto_id, v_cartuchos, v_cartuchos, 0, 0
      ) returning id into v_item_id;
    else
      update public.surtido_items
         set cartuchos_sugeridos  = cartuchos_sugeridos + v_cartuchos,
             cartuchos_entregados = cartuchos_entregados + v_cartuchos
       where id = v_item_id;
    end if;

    -- PEPS cartuchos (lanza excepción si no alcanza → rollback de todo)
    v_primario := null;
    for pk in select * from public.pick_batch_peps_cartucho(r.producto_id, v_cartuchos) loop
      select cantidad_disponible, gramos_por_cartucho into v_enc
        from public.encartuchados where id = pk.encartuchado_id for update;
      update public.encartuchados
         set cantidad_disponible = cantidad_disponible - pk.cantidad_tomar
       where id = pk.encartuchado_id;

      v_gramos := pk.cantidad_tomar * v_enc.gramos_por_cartucho;
      v_valor  := round(v_gramos * pk.costo_promedio_g, 2);

      insert into public.movimientos_inventario (
        tipo, producto_id, encartuchado_id, maquina_id, presentacion,
        cantidad_cartuchos, gramos, costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id
      ) values (
        'surtido_salida_cartucho', r.producto_id, pk.encartuchado_id, p_maquina_id, 'cartucho',
        -pk.cantidad_tomar, -v_gramos, pk.costo_promedio_g, -v_valor,
        'surtido_items', v_item_id, v_uid
      );

      if v_primario is null then v_primario := pk.encartuchado_id; end if;
    end loop;
    if v_primario is not null then
      update public.surtido_items set encartuchado_id = v_primario where id = v_item_id;
    end if;
  end loop;

  -- Surtir vasos de la máquina (si aplica)
  select vaso_producto_id,
         greatest(0, coalesce(vaso_capacidad_max, 0) - coalesce(vaso_inventario_actual, 0)) as faltan
    into v_maq
    from public.maquinas where id = p_maquina_id;

  if v_maq.vaso_producto_id is not null and v_maq.faltan > 0 then
    v_vasos := v_maq.faltan;

    select id into v_item_id from public.surtido_items
     where surtido_id = v_surtido_id and maquina_id = p_maquina_id and producto_id = v_maq.vaso_producto_id;
    if v_item_id is null then
      insert into public.surtido_items (
        surtido_id, maquina_id, producto_id,
        cartuchos_sugeridos, cartuchos_entregados, vasos_sugeridos, vasos_entregados
      ) values (
        v_surtido_id, p_maquina_id, v_maq.vaso_producto_id, 0, 0, v_vasos, v_vasos
      ) returning id into v_item_id;
    else
      update public.surtido_items
         set vasos_sugeridos  = vasos_sugeridos + v_vasos,
             vasos_entregados = vasos_entregados + v_vasos
       where id = v_item_id;
    end if;

    v_primario := null;
    for pk in select * from public.pick_lote_peps_vaso(v_maq.vaso_producto_id, v_vasos) loop
      update public.lotes
         set unidades_disponibles = coalesce(unidades_disponibles, 0) - pk.cantidad_tomar
       where id = pk.lote_id;

      v_valor := round(pk.cantidad_tomar * pk.costo_por_unidad, 2);

      insert into public.movimientos_inventario (
        tipo, producto_id, lote_id, maquina_id, presentacion,
        cantidad_vasos, costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id
      ) values (
        'surtido_salida_cartucho', v_maq.vaso_producto_id, pk.lote_id, p_maquina_id, 'vaso',
        -pk.cantidad_tomar, pk.costo_por_unidad, -v_valor,
        'surtido_items', v_item_id, v_uid
      );

      if v_primario is null then v_primario := pk.lote_id; end if;
    end loop;
    if v_primario is not null then
      update public.surtido_items set lote_vaso_id = v_primario where id = v_item_id;
    end if;
  end if;

  -- Marcar surtido completado y la asignación como 'surtida' (solo desde planeada)
  update public.surtidos
     set estado = 'completado', surtido_por = v_uid, fecha_completado = now()
   where id = v_surtido_id and estado <> 'completado';

  update public.asignaciones_diarias
     set estado = 'surtida'
   where id = p_asignacion_id and estado = 'planeada'::asignacion_estado;

  return v_am_id;
end;
$fn$;

grant execute on function public.agregar_maquina_excepcion_surtir(uuid, uuid, text, excepcion_motivo, text) to authenticated;
