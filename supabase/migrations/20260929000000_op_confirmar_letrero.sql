-- ============================================================================
-- El operador puede confirmar el letrero de su propia sustitución.
--
-- Diego marcó la casilla en campo y el sistema lo rechazó con
-- "violates check constraint sustitucion_campana_exige_letrero".
--
-- La causa: la policy `sustituciones_write` deja escribir a admin, dirección,
-- planeación y almacén — **al operador no**. Su UPDATE no afectaba ningún
-- renglón, y RLS no devuelve error: simplemente filtra. La app daba por hecho
-- que se había guardado, llamaba a la RPC de ejecutar —esa sí `security
-- definer`— y el check reventaba, con un mensaje que no le dice nada a nadie
-- parado frente a una máquina.
--
-- Esta función deja al operador confirmar SOLO eso, y solo en una sustitución
-- que siga pendiente. No le abre nada más de la tabla.
-- ============================================================================

create or replace function public.op_confirmar_letrero(p_sustitucion_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  update public.sustituciones_tolva
     set letrero_confirmado = true
   where id = p_sustitucion_id
     and estado = 'pendiente';

  if not found then
    raise exception 'Esa sustitucion no existe o ya no esta pendiente.';
  end if;
end;
$$;

comment on function public.op_confirmar_letrero is
  'El operador confirma que cambio el letrero de la pantalla Nayax. Existe porque la policy de sustituciones_tolva no le deja escribir directo, y sin esto no podia cerrar un cambio de campana.';

revoke execute on function public.op_confirmar_letrero(uuid) from public, anon;
grant execute on function public.op_confirmar_letrero(uuid) to authenticated, service_role;
