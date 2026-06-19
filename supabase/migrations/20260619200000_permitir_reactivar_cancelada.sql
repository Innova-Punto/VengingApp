-- ============================================================================
-- Permitir reactivar asignaciones canceladas como `planeada`.
--
-- La regla original bloqueaba cualquier transición desde cancelada. Pero
-- planeación necesita poder reactivar cuando se cancela por error. Sólo se
-- permite el camino cancelada → planeada (otras transiciones desde cancelada
-- siguen bloqueadas porque no tienen sentido operativo).
-- ============================================================================

create or replace function public.fn_asignacion_estado_machine()
returns trigger language plpgsql as $$
begin
  if current_setting('app.allow_estado_regression', true) = 'on' then
    return NEW;
  end if;

  if OLD.estado is distinct from NEW.estado then
    if OLD.estado = 'en_jornada'::asignacion_estado
       and NEW.estado in ('planeada'::asignacion_estado, 'surtida'::asignacion_estado)
    then
      raise exception 'No se puede regresar la asignación de en_jornada a %. La jornada ya inició. Usa "Reabrir ruta" si necesitas modificarla.', NEW.estado;
    end if;

    if OLD.estado = 'completada'::asignacion_estado
       and NEW.estado <> 'completada'::asignacion_estado
       and NEW.estado <> 'cancelada'::asignacion_estado
    then
      raise exception 'No se puede modificar una asignación completada. Usa "Reabrir ruta" si necesitas hacerlo.';
    end if;

    if OLD.estado = 'completada_parcialmente'::asignacion_estado
       and NEW.estado <> 'completada_parcialmente'::asignacion_estado
       and NEW.estado <> 'cancelada'::asignacion_estado
    then
      raise exception 'No se puede modificar una asignación completada parcialmente. Usa "Reabrir ruta" si necesitas hacerlo.';
    end if;

    -- Cancelada solo puede reactivarse como planeada (caso "cancelé por error").
    if OLD.estado = 'cancelada'::asignacion_estado
       and NEW.estado <> 'cancelada'::asignacion_estado
       and NEW.estado <> 'planeada'::asignacion_estado
    then
      raise exception 'Una asignación cancelada solo puede reactivarse como planeada (intento: %).', NEW.estado;
    end if;
  end if;

  return NEW;
end;
$$;
