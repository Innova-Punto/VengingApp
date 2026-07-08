-- ============================================================================
-- 88 · Cierre automático fin de día: alertas por casos incompletos
--
-- Extiende cerrar_jornadas_pendientes_fin_de_dia() para que, al cerrar a la
-- fuerza rutas 'en_jornada' de días anteriores, además de lo que ya hacía
-- (force-close de check-ins + devolución de máquinas NO visitadas), genere:
--
--   (a) alerta 'checkin_sin_llenado' (warning) por cada check-in de la ruta
--       SIN llenado registrado → el operador visitó pero no capturó carga; el
--       sistema NO adivina la devolución (podría haber cargado parte, como en
--       el caso Delta 04-jul), se deja para reconciliación humana.
--   (b) alerta 'maquina_no_visitada' (info) por cada máquina del surtido que
--       nunca se visitó y cuyo surtido se devolvió en automático.
--
-- No cambia la lógica de inventario existente (kardex append-only intacto).
-- ============================================================================

create or replace function public.cerrar_jornadas_pendientes_fin_de_dia()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_asig record;
  v_hoy_cdmx date := (now() at time zone 'America/Mexico_City')::date;
  v_cerradas int := 0;
  v_canceladas_surtida int := 0;
  v_devoluciones int := 0;
  v_alertas int := 0;
  v_total_devs int;
  v_total_al int;
  v_sistema uuid := 'b16c8e99-9dba-4694-82cb-a125491e7d9a'; -- direccion (sistema)
begin
  -- A) Rutas EN JORNADA de días anteriores → completada_parcialmente
  for v_asig in
    select a.id, a.operador_id, a.fecha
      from public.asignaciones_diarias a
     where a.estado = 'en_jornada'::asignacion_estado
       and a.fecha < v_hoy_cdmx
  loop
    perform set_config('app.allow_estado_regression', 'on', true);

    update public.check_ins
       set fecha_salida = now(), cierre_forzado = true
     where asignacion_id = v_asig.id and fecha_salida is null;

    with ins_cart as (
      insert into public.devoluciones_almacen (
        surtido_item_id, asignacion_id, maquina_id, operador_id, producto_id,
        encartuchado_id, llenado_item_id, cantidad_calculada, estado, notas)
      select si.id, v_asig.id, si.maquina_id, v_asig.operador_id, si.producto_id,
             si.encartuchado_id, null, si.cartuchos_entregados,
             'pendiente_devolucion'::devolucion_estado,
             'Auto-generada por cierre automático fin de día'
        from public.surtidos s join public.surtido_items si on si.surtido_id = s.id
       where s.asignacion_id = v_asig.id and si.cartuchos_entregados > 0
         and not exists (select 1 from public.check_ins ci
                          where ci.asignacion_id = v_asig.id and ci.maquina_id = si.maquina_id)
      returning 1)
    select count(*) into v_total_devs from ins_cart;
    v_devoluciones := v_devoluciones + v_total_devs;

    with ins_vasos as (
      insert into public.devoluciones_almacen (
        surtido_item_id, asignacion_id, maquina_id, operador_id, producto_id,
        encartuchado_id, llenado_item_id, cantidad_calculada, estado, notas)
      select si.id, v_asig.id, si.maquina_id, v_asig.operador_id, si.producto_id,
             null, null, si.vasos_entregados,
             'pendiente_devolucion'::devolucion_estado,
             'Auto-generada por cierre automático fin de día · VASOS'
        from public.surtidos s join public.surtido_items si on si.surtido_id = s.id
       where s.asignacion_id = v_asig.id and si.vasos_entregados > 0
         and not exists (select 1 from public.check_ins ci
                          where ci.asignacion_id = v_asig.id and ci.maquina_id = si.maquina_id)
      returning 1)
    select count(*) into v_total_devs from ins_vasos;
    v_devoluciones := v_devoluciones + v_total_devs;

    -- (a) ALERTA: máquinas con check-in pero SIN llenado (visitadas, sin registro)
    with ins_al as (
      insert into public.alertas (tipo, severidad, maquina_id, mensaje, datos_jsonb)
      select 'checkin_sin_llenado'::alerta_tipo, 'warning'::alerta_severidad, ci.maquina_id,
             'Check-in del ' || to_char(ci.fecha_entrada at time zone 'America/Mexico_City','DD-Mon-YYYY')
               || ' en ' || coalesce(mq.alias, 'serie '||mq.serie)
               || ' cerrado a la fuerza SIN llenado registrado. Requiere reconciliación manual (carga/devolución).',
             jsonb_build_object('check_in_id', ci.id, 'asignacion_id', v_asig.id,
                                'operador_id', ci.operador_id, 'fecha_entrada', ci.fecha_entrada)
        from public.check_ins ci
        join public.maquinas mq on mq.id = ci.maquina_id
       where ci.asignacion_id = v_asig.id
         and not exists (select 1 from public.llenados ll where ll.check_in_id = ci.id)
         and not exists (select 1 from public.alertas a
                          where a.tipo = 'checkin_sin_llenado'::alerta_tipo
                            and (a.datos_jsonb->>'check_in_id')::uuid = ci.id)
      returning 1)
    select count(*) into v_total_al from ins_al;
    v_alertas := v_alertas + v_total_al;

    -- (b) ALERTA: máquinas del surtido NO visitadas (surtido devuelto en automático)
    with ins_al2 as (
      insert into public.alertas (tipo, severidad, maquina_id, mensaje, datos_jsonb)
      select distinct 'maquina_no_visitada'::alerta_tipo, 'info'::alerta_severidad, si.maquina_id,
             'Máquina ' || coalesce(mq.alias, 'serie '||mq.serie)
               || ' no visitada en la ruta del ' || to_char(v_asig.fecha,'DD-Mon-YYYY')
               || '. Surtido devuelto automáticamente al almacén.',
             jsonb_build_object('asignacion_id', v_asig.id, 'maquina_id', si.maquina_id)
        from public.surtidos s
        join public.surtido_items si on si.surtido_id = s.id
        join public.maquinas mq on mq.id = si.maquina_id
       where s.asignacion_id = v_asig.id
         and (si.cartuchos_entregados > 0 or si.vasos_entregados > 0)
         and not exists (select 1 from public.check_ins ci
                          where ci.asignacion_id = v_asig.id and ci.maquina_id = si.maquina_id)
         and not exists (select 1 from public.alertas a
                          where a.tipo = 'maquina_no_visitada'::alerta_tipo
                            and (a.datos_jsonb->>'asignacion_id')::uuid = v_asig.id
                            and (a.datos_jsonb->>'maquina_id')::uuid = si.maquina_id)
      returning 1)
    select count(*) into v_total_al from ins_al2;
    v_alertas := v_alertas + v_total_al;

    update public.asignaciones_diarias
       set estado = 'completada_parcialmente'::asignacion_estado,
           motivo_cierre_incompleto = 'Cierre automático fin de día'
     where id = v_asig.id;

    perform set_config('app.allow_estado_regression', 'off', true);
    v_cerradas := v_cerradas + 1;
  end loop;

  -- B) Rutas SURTIDA (o planeada) de días anteriores que nunca arrancaron →
  --    cancelar y reintegrar todo el surtido al almacén.
  for v_asig in
    select a.id
      from public.asignaciones_diarias a
     where a.estado in ('surtida'::asignacion_estado, 'planeada'::asignacion_estado)
       and a.fecha < v_hoy_cdmx
  loop
    perform public.cancelar_ruta_surtida(
      v_asig.id,
      'Cancelación automática fin de día: la ruta no se ejecutó.',
      v_sistema
    );
    v_canceladas_surtida := v_canceladas_surtida + 1;
  end loop;

  return jsonb_build_object(
    'fecha_cdmx', v_hoy_cdmx,
    'en_jornada_cerradas', v_cerradas,
    'surtidas_canceladas', v_canceladas_surtida,
    'devoluciones_generadas', v_devoluciones,
    'alertas_generadas', v_alertas,
    'ejecutado_at', now()
  );
end;
$function$;
