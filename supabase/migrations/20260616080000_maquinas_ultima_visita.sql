-- ============================================================================
-- Última visita real por máquina.
--
-- Almacena en `maquinas.ultima_visita_at` la fecha del último check_out
-- legítimo (operador cerró la visita normalmente). Los cierres forzados
-- por cierre parcial NO cuentan — se marcan con `check_ins.cierre_forzado`.
-- Trigger mantiene el campo al día.
-- ============================================================================

alter table public.check_ins
  add column if not exists cierre_forzado boolean not null default false;

comment on column public.check_ins.cierre_forzado is
  'TRUE cuando el check_in se cerró automáticamente al hacer cierre parcial de jornada (no es una visita real terminada). FALSE para visitas cerradas normalmente por el operador.';

alter table public.maquinas
  add column if not exists ultima_visita_at timestamptz;

comment on column public.maquinas.ultima_visita_at is
  'Fecha del último check_out legítimo (cierre_forzado=false). NULL si la máquina nunca ha sido visitada.';

-- Backfill
update public.maquinas m
   set ultima_visita_at = sub.last_visit
  from (
    select ci.maquina_id, max(ci.fecha_salida) as last_visit
      from public.check_ins ci
     where ci.fecha_salida is not null
       and ci.cierre_forzado = false
     group by ci.maquina_id
  ) sub
 where sub.maquina_id = m.id;

create or replace function public.fn_maquinas_ultima_visita()
returns trigger language plpgsql as $$
begin
  if NEW.fecha_salida is not null
     and (TG_OP = 'INSERT'
          or OLD.fecha_salida is null
          or OLD.fecha_salida is distinct from NEW.fecha_salida)
     and coalesce(NEW.cierre_forzado, false) = false then
    update public.maquinas
       set ultima_visita_at = NEW.fecha_salida
     where id = NEW.maquina_id
       and (ultima_visita_at is null or ultima_visita_at < NEW.fecha_salida);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_maquinas_ultima_visita on public.check_ins;
create trigger trg_maquinas_ultima_visita
  after insert or update of fecha_salida on public.check_ins
  for each row execute function public.fn_maquinas_ultima_visita();


-- Marca check_ins forzados al cerrar ruta parcial (cierre_forzado=true).
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
     set fecha_salida = now(),
         cierre_forzado = true
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
     set estado = 'completada_parcialmente'::asignacion_estado,
         motivo_cierre_incompleto = trim(p_motivo)
   where id = p_asignacion_id;

  perform set_config('app.allow_estado_regression', 'off', true);
end;
$$;
