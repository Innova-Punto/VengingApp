-- ============================================================================
-- 34 · Autorización de merma con descuento de inventario
--      Cierre automático de jornada al completar todas las máquinas
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPC autorizar_merma_incidencia
--   Autoriza la merma de los cartuchos afectados por una incidencia.
--   - Marca autorizada_por, fecha_autorizacion, notas_resolucion.
--   - Opcionalmente cierra la incidencia (p_cerrar = true).
--   - Si la incidencia tiene encartuchado_afectado y cartuchos_afectados > 0:
--       descuenta del encartuchado y registra kardex:
--         · merma_ruta si maquina_id no es null (pasó en campo)
--         · merma_encartuchado si no (pasó en almacén)
--   - Excepción: discrepancia_devolucion NO descuenta porque los cartuchos
--     faltantes nunca regresaron al encartuchado al recibir; ya están fuera.
-- ----------------------------------------------------------------------------

create or replace function public.autorizar_merma_incidencia(
  p_incidencia_id uuid,
  p_notas_resolucion text default null,
  p_cerrar boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_inc record;
  v_enc record;
  v_gramos int;
  v_valor numeric(14,2);
  v_tipo_mov movimiento_tipo;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'Solo admin o dirección pueden autorizar mermas';
  end if;

  select * into v_inc from public.incidencias where id = p_incidencia_id for update;
  if v_inc is null then raise exception 'Incidencia no encontrada'; end if;
  if v_inc.autorizada_por is not null then
    raise exception 'La merma ya fue autorizada previamente';
  end if;

  update public.incidencias
     set autorizada_por = v_uid,
         fecha_autorizacion = now(),
         notas_resolucion = coalesce(p_notas_resolucion, notas_resolucion),
         estado = case when p_cerrar then 'resuelta'::incidencia_estado else estado end,
         fecha_cierre = case when p_cerrar then now() else fecha_cierre end
   where id = p_incidencia_id;

  -- discrepancia_devolucion no descuenta: los cartuchos faltantes nunca
  -- regresaron al encartuchado, por lo tanto no están "ahí" para descontar.
  if v_inc.tipo = 'discrepancia_devolucion'::incidencia_tipo then
    return p_incidencia_id;
  end if;

  if v_inc.encartuchado_afectado_id is null
     or coalesce(v_inc.cartuchos_afectados, 0) <= 0 then
    return p_incidencia_id;
  end if;

  select * into v_enc from public.encartuchados
   where id = v_inc.encartuchado_afectado_id for update;
  if v_enc is null then raise exception 'Encartuchado afectado no encontrado'; end if;

  if v_enc.cantidad_disponible < v_inc.cartuchos_afectados then
    raise exception
      'No hay suficientes cartuchos en el encartuchado para mermar (disponible: %, requerido: %)',
      v_enc.cantidad_disponible, v_inc.cartuchos_afectados;
  end if;

  update public.encartuchados
     set cantidad_disponible = cantidad_disponible - v_inc.cartuchos_afectados
   where id = v_inc.encartuchado_afectado_id;

  v_gramos := v_inc.cartuchos_afectados * v_enc.gramos_por_cartucho;
  v_valor := round(v_gramos * v_enc.costo_promedio_g, 2);

  v_tipo_mov := case
    when v_inc.maquina_id is not null then 'merma_ruta'::movimiento_tipo
    else 'merma_encartuchado'::movimiento_tipo
  end;

  insert into public.movimientos_inventario (
    tipo, producto_id, encartuchado_id, maquina_id,
    presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
    costo_por_gramo_snapshot, valor_movimiento,
    referencia_tabla, referencia_id, usuario_id, notas
  ) values (
    v_tipo_mov,
    v_inc.producto_afectado_id, v_inc.encartuchado_afectado_id, v_inc.maquina_id,
    'cartucho'::mov_presentacion,
    -v_inc.cartuchos_afectados, 0, -v_gramos,
    v_enc.costo_promedio_g, -v_valor,
    'incidencias', p_incidencia_id, v_uid,
    'Merma autorizada por incidencia ' || v_inc.folio
  );

  return p_incidencia_id;
end;
$$;

revoke all on function public.autorizar_merma_incidencia(uuid, text, boolean) from public;
grant execute on function public.autorizar_merma_incidencia(uuid, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Cierre automático de jornada
--   Cuando un check-in pasa a cerrado (fecha_salida no nulo), verifica si
--   todas las máquinas de la asignación ya tienen check-in cerrado. Si sí,
--   marca la asignación como completada y actualiza hora_ultima_actividad.
-- ----------------------------------------------------------------------------

create or replace function public.fn_check_jornada_completada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pendientes int;
begin
  select count(*) into v_pendientes
    from public.asignacion_maquinas am
   where am.asignacion_id = NEW.asignacion_id
     and not exists (
       select 1 from public.check_ins ci
        where ci.asignacion_id = am.asignacion_id
          and ci.maquina_id = am.maquina_id
          and ci.fecha_salida is not null
     );

  if v_pendientes = 0 then
    update public.asignaciones_diarias
       set estado = 'completada'
     where id = NEW.asignacion_id
       and estado = 'en_jornada';

    update public.jornadas
       set hora_ultima_actividad = now()
     where asignacion_id = NEW.asignacion_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_check_jornada_completada on public.check_ins;
create trigger trg_check_jornada_completada
  after update on public.check_ins
  for each row
  when (NEW.fecha_salida is not null and OLD.fecha_salida is null)
  execute function public.fn_check_jornada_completada();
