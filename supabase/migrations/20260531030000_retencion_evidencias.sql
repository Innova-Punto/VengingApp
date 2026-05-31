-- ============================================================================
-- 43 · Política de retención de evidencias (4 meses)
--
-- Las fotos de check-in, llenado, incidencias y jornada se guardan en
-- Storage. Aplicamos retención de 4 meses: una función borra los objetos
-- viejos y un job de pg_cron la ejecuta diariamente a las 3am UTC.
-- ============================================================================

create or replace function public.cleanup_evidencias_viejas()
returns int
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_count int := 0;
begin
  with viejos as (
    select id
      from storage.objects
     where bucket_id in (
       'evidencias-checkin',
       'evidencias-llenado',
       'evidencias-incidencias',
       'evidencias-jornada'
     )
       and created_at < now() - interval '4 months'
  ),
  borrados as (
    delete from storage.objects
     where id in (select id from viejos)
     returning id
  )
  select count(*) into v_count from borrados;
  return v_count;
end;
$$;

revoke all on function public.cleanup_evidencias_viejas() from public;
grant execute on function public.cleanup_evidencias_viejas() to service_role;

-- Programa job diario (3am UTC = 9pm CDMX en horario estándar)
-- Si ya existe, lo reemplaza
do $$
begin
  perform cron.unschedule('cleanup-evidencias-diario');
exception when others then null;
end $$;

select cron.schedule(
  'cleanup-evidencias-diario',
  '0 3 * * *',
  $$select public.cleanup_evidencias_viejas();$$
);
