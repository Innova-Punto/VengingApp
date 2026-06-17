-- ============================================================================
-- Cierre automático de jornadas pendientes al final del día.
--
-- Si un operador olvidó cerrar su ruta y pasó la medianoche (CDMX), el cron
-- la cierra automáticamente como `completada_parcialmente` con motivo
-- "Cierre automático fin de día" y genera devoluciones para las máquinas
-- que se quedaron sin visitar. Mismo comportamiento que el cierre manual,
-- solo que sin auth.uid (corre como sistema vía pg_cron).
-- ============================================================================

create or replace function public.cerrar_jornadas_pendientes_fin_de_dia()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_asig record;
  v_hoy_cdmx date := (now() at time zone 'America/Mexico_City')::date;
  v_motivo text := 'Cierre automático fin de día';
  v_cerradas int := 0;
  v_devoluciones int := 0;
  v_total_devs int;
begin
  for v_asig in
    select a.id, a.operador_id
      from public.asignaciones_diarias a
     where a.estado = 'en_jornada'::asignacion_estado
       and a.fecha < v_hoy_cdmx
  loop
    perform set_config('app.allow_estado_regression', 'on', true);

    update public.check_ins
       set fecha_salida = now(),
           cierre_forzado = true
     where asignacion_id = v_asig.id
       and fecha_salida is null;

    with ins_cart as (
      insert into public.devoluciones_almacen (
        surtido_item_id, asignacion_id, maquina_id,
        operador_id, producto_id, encartuchado_id, llenado_item_id,
        cantidad_calculada, estado, notas
      )
      select si.id, v_asig.id, si.maquina_id,
             v_asig.operador_id, si.producto_id, si.encartuchado_id, null,
             si.cartuchos_entregados,
             'pendiente_devolucion'::devolucion_estado,
             'Auto-generada por cierre automático fin de día'
        from public.surtidos s
        join public.surtido_items si on si.surtido_id = s.id
       where s.asignacion_id = v_asig.id
         and si.cartuchos_entregados > 0
         and not exists (
           select 1 from public.check_ins ci
            where ci.asignacion_id = v_asig.id
              and ci.maquina_id = si.maquina_id
         )
      returning 1
    )
    select count(*) into v_total_devs from ins_cart;
    v_devoluciones := v_devoluciones + v_total_devs;

    with ins_vasos as (
      insert into public.devoluciones_almacen (
        surtido_item_id, asignacion_id, maquina_id,
        operador_id, producto_id, encartuchado_id, llenado_item_id,
        cantidad_calculada, estado, notas
      )
      select si.id, v_asig.id, si.maquina_id,
             v_asig.operador_id, si.producto_id, null, null,
             si.vasos_entregados,
             'pendiente_devolucion'::devolucion_estado,
             'Auto-generada por cierre automático fin de día · VASOS'
        from public.surtidos s
        join public.surtido_items si on si.surtido_id = s.id
       where s.asignacion_id = v_asig.id
         and si.vasos_entregados > 0
         and not exists (
           select 1 from public.check_ins ci
            where ci.asignacion_id = v_asig.id
              and ci.maquina_id = si.maquina_id
         )
      returning 1
    )
    select count(*) into v_total_devs from ins_vasos;
    v_devoluciones := v_devoluciones + v_total_devs;

    update public.asignaciones_diarias
       set estado = 'completada_parcialmente'::asignacion_estado,
           motivo_cierre_incompleto = v_motivo
     where id = v_asig.id;

    perform set_config('app.allow_estado_regression', 'off', true);
    v_cerradas := v_cerradas + 1;
  end loop;

  return jsonb_build_object(
    'fecha_cdmx', v_hoy_cdmx,
    'asignaciones_cerradas', v_cerradas,
    'devoluciones_generadas', v_devoluciones,
    'ejecutado_at', now()
  );
end;
$$;

-- pg_cron: 00:05 CDMX = 06:05 UTC todos los días.
-- CDMX no observa horario de verano desde 2023; siempre UTC-6.
select cron.schedule(
  'cerrar_jornadas_pendientes_fin_de_dia',
  '5 6 * * *',
  $$select public.cerrar_jornadas_pendientes_fin_de_dia();$$
);
