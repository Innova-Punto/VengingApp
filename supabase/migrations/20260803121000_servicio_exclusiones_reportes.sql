-- ============================================================================
-- 98 · Máquinas tipo 'servicio': exclusión de reportes de venta y cierre
--
-- 1) reporte_ventas_maquinas(): excluye tipo 'servicio' (no venden vía Nayax).
--    Esto cubre también la alerta maquina_sin_venta_12h, que se alimenta de
--    este reporte, y la página Salud de máquinas.
-- 2) cerrar_jornadas_pendientes_fin_de_dia(): la alerta "checkin_sin_llenado"
--    ahora entiende máquinas de servicio — para ellas lo esperado no es un
--    llenado sino una visita de servicio registrada (servicio_visitas).
-- Las devoluciones automáticas no cambian: dependen de surtido_items y las
-- máquinas de servicio no se surten.
-- ============================================================================

-- 1) reporte_ventas_maquinas sin máquinas de servicio
drop function if exists public.reporte_ventas_maquinas();
create function public.reporte_ventas_maquinas()
returns table(
  maquina_id uuid, serie text, alias text, ubicacion text, cliente text,
  servicios_ayer int, monto_ayer numeric,
  serv_mes_actual int, prom_dia_actual numeric,
  serv_mes_pasado int, prom_dia_pasado numeric,
  ultima_venta timestamptz, activa boolean,
  horas_op_sin_venta numeric, abierta_ahora boolean,
  ruta_id uuid, ruta_nombre text, operador_id uuid, operador_nombre text
)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  with w as (select (now() at time zone 'America/Mexico_City')::date as hoy),
  lim as (
    select
      ((hoy - 1)::timestamp at time zone 'America/Mexico_City') as ayer_ini,
      (hoy::timestamp at time zone 'America/Mexico_City')       as ayer_fin,
      (date_trunc('month', hoy::timestamp)::timestamp at time zone 'America/Mexico_City') as mes_ini,
      (date_trunc('month', (hoy - interval '1 month'))::timestamp at time zone 'America/Mexico_City') as mespas_ini,
      (date_trunc('month', hoy::timestamp)::timestamp at time zone 'America/Mexico_City') as mespas_fin,
      greatest(1, extract(day from (hoy - 1))::int) as dias_actual,
      extract(day from (date_trunc('month', hoy::timestamp) - interval '1 day'))::int as dias_pasado,
      now() as ahora,
      (now() at time zone 'America/Mexico_City')::time as lt
    from w
  ),
  agg as (
    select vm.maquina_id,
      count(*) filter (where vm.fecha_transaccion >= l.ayer_ini and vm.fecha_transaccion < l.ayer_fin) as s_ayer,
      coalesce(sum(vm.precio_bruto) filter (where vm.fecha_transaccion >= l.ayer_ini and vm.fecha_transaccion < l.ayer_fin),0) as m_ayer,
      count(*) filter (where vm.fecha_transaccion >= l.mes_ini and vm.fecha_transaccion < l.ayer_fin) as s_mes_act,
      count(*) filter (where vm.fecha_transaccion >= l.mespas_ini and vm.fecha_transaccion < l.mespas_fin) as s_mes_pas,
      max(vm.fecha_transaccion) as ult
    from public.ventas_maquina vm cross join lim l
    group by vm.maquina_id
  )
  select m.id, m.serie, m.alias, u.nombre, cl.nombre,
    coalesce(a.s_ayer,0)::int, coalesce(a.m_ayer,0)::numeric(14,2),
    coalesce(a.s_mes_act,0)::int, round(coalesce(a.s_mes_act,0)::numeric / l.dias_actual, 2),
    coalesce(a.s_mes_pas,0)::int, round(coalesce(a.s_mes_pas,0)::numeric / nullif(l.dias_pasado,0), 2),
    a.ult, (m.activo and m.estado <> 'baja'),
    public.horas_operativas_entre(coalesce(a.ult, m.created_at), l.ahora,
        coalesce(u.horario_apertura,'06:00'::time), coalesce(u.horario_cierre,'23:00'::time)),
    case
      when coalesce(u.horario_cierre,'23:00'::time) > coalesce(u.horario_apertura,'06:00'::time)
        then l.lt >= coalesce(u.horario_apertura,'06:00'::time) and l.lt < coalesce(u.horario_cierre,'23:00'::time)
      else l.lt >= coalesce(u.horario_apertura,'06:00'::time)
    end,
    rt.ruta_id, rt.ruta_nombre, rt.operador_titular_id, op.full_name
  from public.maquinas m
  cross join lim l
  left join agg a on a.maquina_id = m.id
  left join public.ubicaciones u on u.id = m.ubicacion_id
  left join public.clientes cl on cl.id = u.cliente_id
  left join lateral (
    select rm.ruta_id, r.nombre as ruta_nombre, r.operador_titular_id
    from public.ruta_maquinas rm join public.rutas r on r.id = rm.ruta_id
    where rm.maquina_id = m.id and r.activa
    order by rm.orden nulls last
    limit 1
  ) rt on true
  left join public.profiles op on op.id = rt.operador_titular_id
  where m.activo and m.estado <> 'baja'
    and m.tipo <> 'servicio'
  order by coalesce(a.s_ayer,0) asc, m.alias;
$$;
grant execute on function public.reporte_ventas_maquinas() to authenticated;
revoke execute on function public.reporte_ventas_maquinas() from anon, public;

-- 2) Cierre fin de día: alerta consciente de máquinas de servicio
create or replace function public.cerrar_jornadas_pendientes_fin_de_dia()
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
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

    -- (a) ALERTA: check-in cerrado a la fuerza sin registro de trabajo.
    --     Máquinas normales → falta LLENADO. Máquinas de servicio → falta
    --     VISITA DE SERVICIO (servicio_visitas).
    with ins_al as (
      insert into public.alertas (tipo, severidad, maquina_id, mensaje, datos_jsonb)
      select 'checkin_sin_llenado'::alerta_tipo, 'warning'::alerta_severidad, ci.maquina_id,
             'Check-in del ' || to_char(ci.fecha_entrada at time zone 'America/Mexico_City','DD-Mon-YYYY')
               || ' en ' || coalesce(mq.alias, 'serie '||mq.serie)
               || case when mq.tipo = 'servicio'
                    then ' cerrado a la fuerza SIN servicio registrado. Verificar con el operador.'
                    else ' cerrado a la fuerza SIN llenado registrado. Requiere reconciliación manual (carga/devolución).'
                  end,
             jsonb_build_object('check_in_id', ci.id, 'asignacion_id', v_asig.id,
                                'operador_id', ci.operador_id, 'fecha_entrada', ci.fecha_entrada)
        from public.check_ins ci
        join public.maquinas mq on mq.id = ci.maquina_id
       where ci.asignacion_id = v_asig.id
         and ( (mq.tipo <> 'servicio'
                and not exists (select 1 from public.llenados ll where ll.check_in_id = ci.id))
            or (mq.tipo = 'servicio'
                and not exists (select 1 from public.servicio_visitas sv where sv.check_in_id = ci.id)) )
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
