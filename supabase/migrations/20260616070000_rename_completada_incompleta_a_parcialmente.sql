-- Renombra el estado a uno más claro semánticamente.
-- (Las migraciones anteriores quedan con el nombre original como
-- registro histórico — siguen funcionando porque la migración corre
-- después de que se haya agregado y usado el valor.)
do $$
begin
  if exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'asignacion_estado'
       and e.enumlabel = 'completada_incompleta'
  ) then
    alter type public.asignacion_estado
      rename value 'completada_incompleta' to 'completada_parcialmente';
  end if;
end $$;
