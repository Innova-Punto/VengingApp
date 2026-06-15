-- ============================================================================
-- Conteo de vasos en pesajes de máquina.
--
-- El pesaje hasta hoy solo cubría las tolvas (granel). Los vasos son
-- unidades discretas (no se pesan, se cuentan), pero también pueden tener
-- merma/robo/rotura y son parte del inventario en máquina. Agregamos un
-- conteo opcional de vasos a `pesajes_maquina`: si la máquina tiene
-- `vaso_producto_id`, el operador puede capturar cuántos vasos quedan.
--
-- Cuando se captura:
--   - Se guarda teórico (vaso_inventario_actual previo) y medido.
--   - Se calcula valor_diferencia usando el último lote activo del vaso
--     (la convención para vasos: lotes.costo_por_gramo guarda $/unidad).
--   - Se actualiza maquinas.vaso_inventario_actual al valor medido.
--   - Se genera movimiento_inventario tipo ajuste_conteo_maquina con la
--     diferencia en `cantidad_vasos`.
-- ============================================================================

alter table public.pesajes_maquina
  add column if not exists vasos_teoricos        integer,
  add column if not exists vasos_medidos         integer,
  add column if not exists vasos_costo_unitario  numeric(12, 6),
  add column if not exists vasos_valor_diferencia numeric(14, 2),
  add column if not exists vasos_alerta_generada boolean not null default false;

comment on column public.pesajes_maquina.vasos_medidos is
  'Cantidad de vasos que el operador contó físicamente en la máquina al pesar. NULL = no se contaron.';
comment on column public.pesajes_maquina.vasos_teoricos is
  'Snapshot del inventario teórico de vasos (maquinas.vaso_inventario_actual) al momento del pesaje.';


create or replace function public.op_registrar_pesaje_maquina(
  p_check_in_id    uuid,
  p_items          jsonb,
  p_notas          text default null::text,
  p_vasos_medidos  integer default null
) returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_operador uuid;
  v_maquina_id uuid;
  v_cierre_id uuid;
  v_pesaje_id uuid;
  v_item jsonb;
  v_tolva_id uuid;
  v_gramos_medidos int;
  v_tolva record;
  v_diff int;
  v_diff_pct numeric(8, 4);
  v_costo_g numeric;
  v_valor numeric(14, 2);
  v_alerta boolean;
  v_maquina record;
  v_vasos_teoricos int;
  v_vasos_diff int;
  v_vaso_costo numeric;
  v_vasos_valor numeric(14, 2);
  v_vasos_alerta boolean := false;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select operador_id, maquina_id into v_operador, v_maquina_id
    from public.check_ins where id = p_check_in_id;
  if v_maquina_id is null then
    raise exception 'Check-in no encontrado';
  end if;
  if v_operador <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para este check-in';
  end if;

  select * into v_maquina from public.maquinas where id = v_maquina_id;

  select id into v_cierre_id from public.cierres_mensuales
    where estado in ('abierto'::cierre_estado, 'en_proceso'::cierre_estado)
    order by periodo_anio desc, periodo_mes desc
    limit 1;

  if p_vasos_medidos is not null and v_maquina.vaso_producto_id is not null then
    if p_vasos_medidos < 0 then
      raise exception 'vasos_medidos debe ser >= 0';
    end if;
    v_vasos_teoricos := coalesce(v_maquina.vaso_inventario_actual, 0);
    v_vasos_diff := p_vasos_medidos - v_vasos_teoricos;

    select l.costo_por_gramo into v_vaso_costo
      from public.lotes l
     where l.producto_id = v_maquina.vaso_producto_id and l.activo = true
     order by l.created_at desc
     limit 1;
    v_vaso_costo := coalesce(v_vaso_costo, 0);

    v_vasos_valor := round(v_vasos_diff * v_vaso_costo, 2);
    v_vasos_alerta := v_vasos_teoricos > 0
      and abs(v_vasos_diff)::numeric / v_vasos_teoricos >= 0.05;
  end if;

  insert into public.pesajes_maquina (
    cierre_id, maquina_id, check_in_id, operador_id, notas,
    vasos_teoricos, vasos_medidos, vasos_costo_unitario,
    vasos_valor_diferencia, vasos_alerta_generada
  ) values (
    v_cierre_id, v_maquina_id, p_check_in_id, v_operador, p_notas,
    v_vasos_teoricos, p_vasos_medidos, nullif(v_vaso_costo, 0),
    v_vasos_valor, v_vasos_alerta
  )
  returning id into v_pesaje_id;

  if p_vasos_medidos is not null and v_maquina.vaso_producto_id is not null then
    update public.maquinas
       set vaso_inventario_actual = p_vasos_medidos
     where id = v_maquina_id;

    if v_vasos_diff <> 0 then
      insert into public.movimientos_inventario (
        tipo, producto_id, maquina_id, tolva_id,
        presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id
      ) values (
        'ajuste_conteo_maquina'::movimiento_tipo,
        v_maquina.vaso_producto_id, v_maquina_id, null,
        'vaso'::mov_presentacion,
        0, v_vasos_diff, 0,
        v_vaso_costo,
        v_vasos_valor,
        'pesajes_maquina', v_pesaje_id, v_uid
      );
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_tolva_id := (v_item->>'tolva_id')::uuid;
    v_gramos_medidos := coalesce((v_item->>'gramos_medidos')::int, 0);

    if v_gramos_medidos < 0 then
      raise exception 'gramos_medidos debe ser >= 0';
    end if;

    select * into v_tolva from public.tolvas where id = v_tolva_id;
    if v_tolva is null then
      raise exception 'Tolva % no existe', v_tolva_id;
    end if;

    v_diff := v_gramos_medidos - v_tolva.inventario_actual_g;
    v_diff_pct := case
      when v_tolva.inventario_actual_g > 0 then
        round(abs(v_diff)::numeric / v_tolva.inventario_actual_g * 100, 4)
      else null
    end;

    v_costo_g := coalesce(v_tolva.costo_promedio_g_actual, 0);
    if v_costo_g = 0 and v_tolva.producto_id is not null then
      select l.costo_por_gramo into v_costo_g
        from public.lotes l
        where l.producto_id = v_tolva.producto_id and l.activo = true
        order by l.created_at desc
        limit 1;
      v_costo_g := coalesce(v_costo_g, 0);
    end if;

    v_valor := round(v_diff * v_costo_g, 2);
    v_alerta := coalesce(v_diff_pct >= 5, false);

    insert into public.pesaje_tolva_items (
      pesaje_id, tolva_id, gramos_teoricos, gramos_medidos,
      diferencia_porcentaje, valor_diferencia, alerta_generada
    ) values (
      v_pesaje_id, v_tolva_id, v_tolva.inventario_actual_g, v_gramos_medidos,
      v_diff_pct, v_valor, v_alerta
    );

    if v_tolva.inventario_actual_g = 0
       and v_costo_g > 0
       and coalesce(v_tolva.costo_promedio_g_actual, 0) = 0 then
      update public.tolvas set
        inventario_actual_g = v_gramos_medidos,
        costo_promedio_g_actual = v_costo_g,
        ultimo_pesaje_at = now()
      where id = v_tolva_id;
    else
      update public.tolvas set
        inventario_actual_g = v_gramos_medidos,
        ultimo_pesaje_at = now()
      where id = v_tolva_id;
    end if;

    if v_diff <> 0 and v_tolva.producto_id is not null then
      insert into public.movimientos_inventario (
        tipo, producto_id, maquina_id, tolva_id,
        presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id
      ) values (
        'ajuste_conteo_maquina'::movimiento_tipo,
        v_tolva.producto_id, v_maquina_id, v_tolva_id,
        'polvo_en_tolva'::mov_presentacion,
        0, 0, v_diff,
        v_costo_g,
        v_valor,
        'pesaje_tolva_items', v_pesaje_id, v_uid
      );
    end if;
  end loop;

  return v_pesaje_id;
end;
$function$;

grant execute on function public.op_registrar_pesaje_maquina(uuid, jsonb, text, integer) to authenticated;

drop function if exists public.op_registrar_pesaje_maquina(uuid, jsonb, text);
