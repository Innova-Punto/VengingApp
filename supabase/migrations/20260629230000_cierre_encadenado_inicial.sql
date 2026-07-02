-- ============================================================================
-- 78 · Cierre encadenado + ventana de periodo
--
-- Modelo correcto del cierre:
--   * El periodo se define por una VENTANA [fecha_inicio_cierre, fecha_cierre].
--     Los flujos (ventas, enviado, mermas, ajustes) se cuentan dentro de esa
--     ventana (ver migración de vista_reporte_cierre), no por mes calendario.
--   * ENCADENADO: al abrir el mes N+1, su inventario inicial = inventario FINAL
--     del cierre N, y su ventana inicia justo donde terminó el cierre N
--     (fecha_inicio_cierre = fecha_cierre del anterior). Sin huecos ni traslapes.
--   * BOOTSTRAP (primer cierre): foto en vivo + ventana desde ahora.
--
-- Corrección puntual junio 2026 (bootstrap):
--   * inicial de máquinas (polvo) = primer pesaje por máquina (inventario que
--     vivía en la máquina al arrancar, 15-jun).
--   * fecha_inicio_cierre = primer pesaje (15-jun) → las ventas se cuentan a
--     partir de esa fecha; lo previo no entra al cierre.
-- ============================================================================

create or replace function public.abrir_cierre_mensual(
  p_mes int, p_anio int
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_prev record;
  v_snap record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'Solo admin o dirección pueden abrir cierres';
  end if;
  if p_mes < 1 or p_mes > 12 then raise exception 'Mes inválido'; end if;
  if p_anio < 2024 or p_anio > 2100 then raise exception 'Año inválido'; end if;

  select id into v_id from public.cierres_mensuales where periodo_mes = p_mes and periodo_anio = p_anio;
  if v_id is not null then return v_id; end if;

  -- Cierre CERRADO anterior más reciente (encadenado)
  select * into v_prev
    from public.cierres_mensuales
   where estado = 'cerrado'::cierre_estado
     and (periodo_anio * 12 + periodo_mes) < (p_anio * 12 + p_mes)
   order by periodo_anio desc, periodo_mes desc
   limit 1;

  if v_prev.id is not null then
    -- Encadenado: inicial = final del anterior; ventana inicia al cerrar el anterior
    insert into public.cierres_mensuales (
      periodo_mes, periodo_anio, estado,
      fecha_inicio_cierre,
      gramos_almacen_inicio, valor_almacen_inicio,
      gramos_maquinas_inicio, valor_maquinas_inicio,
      valor_vasos_almacen_inicio, valor_vasos_maquinas_inicio
    ) values (
      p_mes, p_anio, 'abierto'::cierre_estado,
      coalesce(v_prev.fecha_cierre, now()),
      v_prev.gramos_almacen_fin, v_prev.valor_almacen_fin,
      v_prev.gramos_maquinas_fin, v_prev.valor_maquinas_fin,
      v_prev.valor_vasos_almacen_fin, v_prev.valor_vasos_maquinas_fin
    ) returning id into v_id;
  else
    -- Bootstrap (primer cierre): foto en vivo
    select * into v_snap from public._snapshot_inventario_mxn();
    insert into public.cierres_mensuales (
      periodo_mes, periodo_anio, estado, fecha_inicio_cierre,
      gramos_almacen_inicio, valor_almacen_inicio,
      gramos_maquinas_inicio, valor_maquinas_inicio,
      valor_vasos_almacen_inicio, valor_vasos_maquinas_inicio
    ) values (
      p_mes, p_anio, 'abierto'::cierre_estado, now(),
      v_snap.gramos_almacen, v_snap.valor_almacen,
      v_snap.gramos_maquinas, v_snap.valor_maquinas,
      v_snap.valor_vasos_almacen, v_snap.valor_vasos_maquinas
    ) returning id into v_id;
  end if;

  return v_id;
end;
$fn$;
grant execute on function public.abrir_cierre_mensual(int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- Corrección puntual junio 2026 (bootstrap)
-- ----------------------------------------------------------------------------
update public.cierres_mensuales c
   set gramos_maquinas_inicio = sub.g,
       valor_maquinas_inicio = sub.valor,
       -- Ventana del cierre arranca en el primer pesaje: ventas previas no cuentan
       fecha_inicio_cierre = sub.primer_pesaje
  from (
    with primer as (
      select distinct on (pm.maquina_id) pm.id, pm.fecha
        from public.pesajes_maquina pm
       order by pm.maquina_id, pm.fecha asc
    )
    select coalesce(sum(pti.gramos_medidos),0)::bigint as g,
           round(coalesce(sum(pti.gramos_medidos * coalesce(t.costo_promedio_g_actual,0)),0),2) as valor,
           (select min(fecha) from public.pesajes_maquina) as primer_pesaje
      from primer
      join public.pesaje_tolva_items pti on pti.pesaje_id = primer.id
      left join public.tolvas t on t.id = pti.tolva_id
  ) sub
 where c.periodo_mes = 6 and c.periodo_anio = 2026
   and c.estado <> 'cerrado'::cierre_estado;
