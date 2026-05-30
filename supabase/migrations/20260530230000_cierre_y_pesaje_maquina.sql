-- ============================================================================
-- 35 · Cierre mensual + pesaje en máquina (PWA operador)
--
-- - Abre cierres por (mes, anio). pesajes_maquina y conteos_almacen están
--   atados al cierre, por lo que sin cierre abierto no hay pesaje.
-- - El operador pesa tolvas durante su visita: el RPC ajusta la tolva al
--   peso real, registra pesaje_tolva_items con snapshot teórico y kardex
--   ajuste_conteo_maquina con la diferencia.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPC: abrir_cierre_mensual
-- ----------------------------------------------------------------------------

create or replace function public.abrir_cierre_mensual(
  p_mes int,
  p_anio int
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'Solo admin o dirección pueden abrir cierres';
  end if;
  if p_mes < 1 or p_mes > 12 then raise exception 'Mes inválido'; end if;
  if p_anio < 2024 or p_anio > 2100 then raise exception 'Año inválido'; end if;

  select id into v_id from public.cierres_mensuales
   where periodo_mes = p_mes and periodo_anio = p_anio;
  if v_id is not null then return v_id; end if;

  insert into public.cierres_mensuales (
    periodo_mes, periodo_anio, estado, fecha_inicio_cierre
  ) values (
    p_mes, p_anio, 'abierto'::cierre_estado, now()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.abrir_cierre_mensual(int, int) from public;
grant execute on function public.abrir_cierre_mensual(int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS: pesajes_maquina y pesaje_tolva_items se llenan vía RPC.
--   Lectura: ya existe authenticated_read implícito o agregamos.
-- ----------------------------------------------------------------------------

-- Asegura policies de lectura (puede que ya existan)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='pesajes_maquina'
      and policyname='pesajes_maquina_authenticated_read'
  ) then
    execute 'create policy pesajes_maquina_authenticated_read on public.pesajes_maquina for select to authenticated using (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='pesajes_maquina'
      and policyname='pesajes_maquina_admin_all'
  ) then
    execute 'create policy pesajes_maquina_admin_all on public.pesajes_maquina for all to authenticated using (user_has_role(''admin''::app_role) or user_has_role(''direccion''::app_role)) with check (user_has_role(''admin''::app_role) or user_has_role(''direccion''::app_role))';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='pesaje_tolva_items'
      and policyname='pesaje_tolva_items_authenticated_read'
  ) then
    execute 'create policy pesaje_tolva_items_authenticated_read on public.pesaje_tolva_items for select to authenticated using (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='pesaje_tolva_items'
      and policyname='pesaje_tolva_items_admin_all'
  ) then
    execute 'create policy pesaje_tolva_items_admin_all on public.pesaje_tolva_items for all to authenticated using (user_has_role(''admin''::app_role) or user_has_role(''direccion''::app_role)) with check (user_has_role(''admin''::app_role) or user_has_role(''direccion''::app_role))';
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- RPC: op_registrar_pesaje_maquina
--   p_items: jsonb array [{tolva_id, gramos_medidos, foto_url, notas}]
--
--   1. Valida que el check_in es del operador autenticado (o admin/dir).
--   2. Busca el cierre 'abierto' o 'en_proceso'. Si no hay, falla.
--   3. Crea pesajes_maquina atado al cierre y check_in.
--   4. Por cada item:
--      - Lee inventario_actual_g de la tolva (teórico) y costo_promedio_g_actual.
--      - Crea pesaje_tolva_items con teorico, medido, diferencia y valor.
--      - Marca alerta_generada=true si abs(diferencia_porcentaje) >= 5.
--      - Actualiza tolva: inventario_actual_g = gramos_medidos, ultimo_pesaje_at.
--      - Registra movimientos_inventario tipo ajuste_conteo_maquina con
--        gramos = diferencia (negativo si faltaba en la tolva = merma; positivo
--        si sobraba).
-- ----------------------------------------------------------------------------

create or replace function public.op_registrar_pesaje_maquina(
  p_check_in_id uuid,
  p_items jsonb,
  p_notas text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_maquina_id uuid;
  v_operador_id uuid;
  v_cierre_id uuid;
  v_pesaje_id uuid;
  v_item jsonb;
  v_tolva_id uuid;
  v_gramos_medidos int;
  v_foto text;
  v_item_notas text;
  v_gramos_teoricos int;
  v_costo_actual numeric(12,6);
  v_producto_id uuid;
  v_diferencia int;
  v_diferencia_pct numeric(8,2);
  v_valor numeric(14,2);
  v_alerta boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select maquina_id, operador_id into v_maquina_id, v_operador_id
    from public.check_ins where id = p_check_in_id;
  if v_maquina_id is null then raise exception 'Check-in no encontrado'; end if;
  if v_operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para este check-in';
  end if;

  select id into v_cierre_id
    from public.cierres_mensuales
   where estado in ('abierto'::cierre_estado, 'en_proceso'::cierre_estado)
   order by periodo_anio desc, periodo_mes desc
   limit 1;
  if v_cierre_id is null then
    raise exception 'No hay un cierre mensual abierto. Pide a dirección que lo abra.';
  end if;

  insert into public.pesajes_maquina (
    cierre_id, maquina_id, check_in_id, operador_id, notas
  ) values (
    v_cierre_id, v_maquina_id, p_check_in_id, v_operador_id, p_notas
  ) returning id into v_pesaje_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_tolva_id := (v_item->>'tolva_id')::uuid;
    v_gramos_medidos := coalesce((v_item->>'gramos_medidos')::int, -1);
    v_foto := v_item->>'foto_url';
    v_item_notas := v_item->>'notas';

    if v_gramos_medidos < 0 then
      raise exception 'gramos_medidos debe ser >= 0 para la tolva %', v_tolva_id;
    end if;

    select inventario_actual_g, costo_promedio_g_actual, producto_id
      into v_gramos_teoricos, v_costo_actual, v_producto_id
      from public.tolvas where id = v_tolva_id for update;

    if v_gramos_teoricos is null then
      raise exception 'Tolva % no encontrada', v_tolva_id;
    end if;

    v_diferencia := v_gramos_medidos - v_gramos_teoricos;
    v_diferencia_pct := case
      when v_gramos_teoricos > 0
        then round(v_diferencia::numeric / v_gramos_teoricos * 100, 2)
      else null
    end;
    v_valor := round(v_diferencia * v_costo_actual, 2);
    v_alerta := abs(coalesce(v_diferencia_pct, 0)) >= 5;

    insert into public.pesaje_tolva_items (
      pesaje_id, tolva_id, gramos_medidos, gramos_teoricos,
      diferencia_gramos, diferencia_porcentaje, valor_diferencia,
      foto_url, alerta_generada, notas
    ) values (
      v_pesaje_id, v_tolva_id, v_gramos_medidos, v_gramos_teoricos,
      v_diferencia, v_diferencia_pct, v_valor,
      v_foto, v_alerta, v_item_notas
    );

    update public.tolvas
       set inventario_actual_g = v_gramos_medidos,
           ultimo_pesaje_at = now()
     where id = v_tolva_id;

    if v_diferencia <> 0 and v_producto_id is not null then
      insert into public.movimientos_inventario (
        tipo, producto_id, maquina_id, tolva_id,
        presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas
      ) values (
        'ajuste_conteo_maquina'::movimiento_tipo,
        v_producto_id, v_maquina_id, v_tolva_id,
        'polvo_en_tolva'::mov_presentacion,
        0, 0, v_diferencia,
        v_costo_actual, v_valor,
        'pesaje_tolva_items', v_pesaje_id, v_uid,
        format('Ajuste por pesaje: %s g vs %s g teóricos', v_gramos_medidos, v_gramos_teoricos)
      );
    end if;
  end loop;

  return v_pesaje_id;
end;
$$;

revoke all on function public.op_registrar_pesaje_maquina(uuid, jsonb, text) from public;
grant execute on function public.op_registrar_pesaje_maquina(uuid, jsonb, text) to authenticated;
