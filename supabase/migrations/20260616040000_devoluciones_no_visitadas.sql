-- ============================================================================
-- Soporte para devoluciones por máquina no visitada.
--
-- Cuando el operador cierra ruta incompleta, las máquinas no visitadas también
-- deben generar devolución de los cartuchos/vasos que se llevó. El modelo
-- original solo aceptaba devoluciones atadas a un llenado_item (sobrante de
-- llenado). Ahora aceptamos también devoluciones huérfanas referenciadas al
-- surtido_item, maquina_id y asignacion_id.
-- ============================================================================

alter table public.devoluciones_almacen
  alter column llenado_item_id drop not null,
  alter column encartuchado_id drop not null;

alter table public.devoluciones_almacen
  add column if not exists surtido_item_id uuid references public.surtido_items(id),
  add column if not exists maquina_id      uuid references public.maquinas(id),
  add column if not exists asignacion_id   uuid references public.asignaciones_diarias(id);

create index if not exists devoluciones_almacen_surtido_item_idx
  on public.devoluciones_almacen(surtido_item_id);
create index if not exists devoluciones_almacen_asignacion_idx
  on public.devoluciones_almacen(asignacion_id);

comment on column public.devoluciones_almacen.surtido_item_id is
  'Referencia al surtido_item original cuando la devolución proviene de una máquina no visitada (ruta cerrada incompleta).';


-- Actualizar op_cerrar_jornada_incompleta para generar devoluciones
-- automáticas por cada máquina no visitada con cartuchos/vasos surtidos.
create or replace function public.op_cerrar_jornada_incompleta(
  p_asignacion_id uuid,
  p_motivo text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_estado asignacion_estado;
  v_operador uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select estado, operador_id into v_estado, v_operador
    from public.asignaciones_diarias where id = p_asignacion_id;
  if v_estado is null then raise exception 'Asignación no encontrada'; end if;

  if v_operador <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para esta asignación';
  end if;

  if v_estado <> 'en_jornada'::asignacion_estado then
    raise exception 'Solo se puede cerrar como incompleta una asignación en jornada (estado actual: %).', v_estado;
  end if;

  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Debes indicar el motivo del cierre incompleto.';
  end if;

  perform set_config('app.allow_estado_regression', 'on', true);

  update public.check_ins
     set fecha_salida = now()
   where asignacion_id = p_asignacion_id
     and fecha_salida is null;

  insert into public.devoluciones_almacen (
    surtido_item_id, asignacion_id, maquina_id,
    operador_id, producto_id, encartuchado_id, llenado_item_id,
    cantidad_calculada, estado, notas
  )
  select si.id, p_asignacion_id, si.maquina_id,
         v_operador, si.producto_id, si.encartuchado_id, null,
         si.cartuchos_entregados,
         'pendiente_devolucion'::devolucion_estado,
         'Auto-generada por cierre de ruta incompleta · ' || trim(p_motivo)
    from public.surtidos s
    join public.surtido_items si on si.surtido_id = s.id
   where s.asignacion_id = p_asignacion_id
     and si.cartuchos_entregados > 0
     and not exists (
       select 1 from public.check_ins ci
        where ci.asignacion_id = p_asignacion_id
          and ci.maquina_id = si.maquina_id
     );

  insert into public.devoluciones_almacen (
    surtido_item_id, asignacion_id, maquina_id,
    operador_id, producto_id, encartuchado_id, llenado_item_id,
    cantidad_calculada, estado, notas
  )
  select si.id, p_asignacion_id, si.maquina_id,
         v_operador, si.producto_id, null, null,
         si.vasos_entregados,
         'pendiente_devolucion'::devolucion_estado,
         'Auto-generada por cierre de ruta incompleta · ' || trim(p_motivo) || ' · VASOS'
    from public.surtidos s
    join public.surtido_items si on si.surtido_id = s.id
   where s.asignacion_id = p_asignacion_id
     and si.vasos_entregados > 0
     and not exists (
       select 1 from public.check_ins ci
        where ci.asignacion_id = p_asignacion_id
          and ci.maquina_id = si.maquina_id
     );

  update public.asignaciones_diarias
     set estado = 'completada_incompleta'::asignacion_estado,
         motivo_cierre_incompleto = trim(p_motivo)
   where id = p_asignacion_id;

  perform set_config('app.allow_estado_regression', 'off', true);
end;
$$;
