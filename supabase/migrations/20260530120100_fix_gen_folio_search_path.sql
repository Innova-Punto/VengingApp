-- gen_folio necesita ver el schema public para resolver las secuencias.
-- La migración 18 lo dejó con search_path='' lo que rompía nextval(text).
alter function public.gen_folio(text, text) set search_path = public, pg_temp;

-- Triggers de folio ahora aceptan también cadena vacía (no solo NULL):
-- el SDK de Supabase manda '' cuando el tipo generado marca folio como
-- required.
create or replace function public.set_folio_oc() returns trigger language plpgsql as $$
begin
  if new.folio is null or trim(new.folio) = '' then
    new.folio := public.gen_folio('OC', 'seq_folio_oc');
  end if;
  return new;
end;
$$;
create or replace function public.set_folio_rec() returns trigger language plpgsql as $$
begin
  if new.folio is null or trim(new.folio) = '' then
    new.folio := public.gen_folio('REC', 'seq_folio_rec');
  end if;
  return new;
end;
$$;
create or replace function public.set_folio_enc() returns trigger language plpgsql as $$
begin
  if new.folio is null or trim(new.folio) = '' then
    new.folio := public.gen_folio('ENC', 'seq_folio_enc');
  end if;
  return new;
end;
$$;
create or replace function public.set_folio_sur() returns trigger language plpgsql as $$
begin
  if new.folio is null or trim(new.folio) = '' then
    new.folio := public.gen_folio('SUR', 'seq_folio_sur');
  end if;
  return new;
end;
$$;
create or replace function public.set_folio_inc() returns trigger language plpgsql as $$
begin
  if new.folio is null or trim(new.folio) = '' then
    new.folio := public.gen_folio('INC', 'seq_folio_inc');
  end if;
  return new;
end;
$$;

alter function public.set_folio_oc()  set search_path = public, pg_temp;
alter function public.set_folio_rec() set search_path = public, pg_temp;
alter function public.set_folio_enc() set search_path = public, pg_temp;
alter function public.set_folio_sur() set search_path = public, pg_temp;
alter function public.set_folio_inc() set search_path = public, pg_temp;
