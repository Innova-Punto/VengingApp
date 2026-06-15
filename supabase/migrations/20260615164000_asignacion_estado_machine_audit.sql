-- ============================================================================
-- 72 · Prevención de regresión de estado + auditoría en asignaciones_diarias
--
-- Bug observado: una asignación en estado 'en_jornada' (operador ya inició)
-- fue regresada a 'surtida' por alguna pantalla del planeador, dejando
-- inconsistencia entre el banner de KPIs y la realidad.
--
-- Solución doble:
--   PREVENTIVO: trigger BEFORE UPDATE que bloquea transiciones inválidas.
--   DETECTIVO:  trigger AFTER que registra cada cambio en audit_log con
--               diff completo y resumen de cambio de estado.
-- ============================================================================

-- 1) Máquina de estados
create or replace function public.fn_asignacion_estado_machine()
returns trigger language plpgsql as $$
begin
  if OLD.estado is distinct from NEW.estado then
    if OLD.estado = 'en_jornada'::asignacion_estado
       and NEW.estado in ('planeada'::asignacion_estado, 'surtida'::asignacion_estado)
    then
      raise exception 'No se puede regresar la asignación de en_jornada a %. La jornada ya inició. Si necesitas modificarla, cancélala primero (estado cancelada).', NEW.estado;
    end if;

    if OLD.estado = 'completada'::asignacion_estado
       and NEW.estado <> 'completada'::asignacion_estado
       and NEW.estado <> 'cancelada'::asignacion_estado
    then
      raise exception 'No se puede modificar una asignación completada (estado actual: completada, intento: %).', NEW.estado;
    end if;

    if OLD.estado = 'cancelada'::asignacion_estado
       and NEW.estado <> 'cancelada'::asignacion_estado
    then
      raise exception 'No se puede reactivar una asignación cancelada (intento: %).', NEW.estado;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_asignacion_estado_machine on public.asignaciones_diarias;
create trigger trg_asignacion_estado_machine
  before update of estado on public.asignaciones_diarias
  for each row execute function public.fn_asignacion_estado_machine();


-- 2) Auditoría
create or replace function public.fn_audit_asignaciones_diarias()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_log (tabla, registro_id, accion, user_id, diff_jsonb, fecha)
    values ('asignaciones_diarias', NEW.id, 'insert', v_user,
            jsonb_build_object('new', to_jsonb(NEW)), now());
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if to_jsonb(OLD) is distinct from to_jsonb(NEW) then
      insert into public.audit_log (tabla, registro_id, accion, user_id, diff_jsonb, fecha)
      values ('asignaciones_diarias', NEW.id, 'update', v_user,
              jsonb_build_object(
                'old', to_jsonb(OLD),
                'new', to_jsonb(NEW),
                'estado_cambio', case when OLD.estado is distinct from NEW.estado
                                      then OLD.estado::text || ' → ' || NEW.estado::text
                                      else null end
              ),
              now());
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.audit_log (tabla, registro_id, accion, user_id, diff_jsonb, fecha)
    values ('asignaciones_diarias', OLD.id, 'delete', v_user,
            jsonb_build_object('old', to_jsonb(OLD)), now());
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_asignaciones_diarias on public.asignaciones_diarias;
create trigger trg_audit_asignaciones_diarias
  after insert or update or delete on public.asignaciones_diarias
  for each row execute function public.fn_audit_asignaciones_diarias();


-- 3) Policy de lectura para admin/dirección sobre audit_log
drop policy if exists "audit_log_admin_select" on public.audit_log;
create policy "audit_log_admin_select" on public.audit_log
  for select to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role));
