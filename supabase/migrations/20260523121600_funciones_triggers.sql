-- ============================================================================
-- 16 · Funciones helpers, secuencias de folios y triggers de updated_at
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 16.1 · auth.user_has_role: helper para RLS.
-- Devuelve true si el usuario actual tiene el rol indicado.
-- Search path bloqueado por seguridad (SECURITY DEFINER).
-- ----------------------------------------------------------------------------
create or replace function auth.user_has_role(check_role app_role)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = check_role
  );
$$;

revoke all on function auth.user_has_role(app_role) from public;
grant execute on function auth.user_has_role(app_role) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 16.2 · trigger function: set_updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 16.3 · Aplicación del trigger en todas las tablas con updated_at
-- ----------------------------------------------------------------------------
do $$
declare
  tbl text;
  tables text[] := array[
    'profiles',
    'proveedores',
    'clientes',
    'productos',
    'presentaciones_proveedor',
    'ubicaciones',
    'maquinas',
    'tolvas',
    'contratos_cliente',
    'rutas',
    'asignaciones_diarias',
    'ordenes_compra',
    'recepciones',
    'surtidos',
    'incidencias',
    'devoluciones_almacen',
    'cierres_mensuales',
    'conteos_almacen',
    'reportes_cliente'
  ];
begin
  foreach tbl in array tables loop
    execute format(
      'create trigger trg_%I_set_updated_at
         before update on public.%I
         for each row execute function public.set_updated_at()',
      tbl, tbl
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 16.4 · Secuencias de folios y triggers de generación automática
-- ----------------------------------------------------------------------------
create sequence if not exists seq_folio_oc  start 1;
create sequence if not exists seq_folio_rec start 1;
create sequence if not exists seq_folio_enc start 1;
create sequence if not exists seq_folio_sur start 1;
create sequence if not exists seq_folio_inc start 1;

create or replace function public.gen_folio(prefijo text, seq_name text)
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select nextval(%L)', seq_name) into n;
  return prefijo || '-' || lpad(n::text, 6, '0');
end;
$$;

create or replace function public.set_folio_oc()  returns trigger language plpgsql as $$
begin if new.folio is null then new.folio := public.gen_folio('OC',  'seq_folio_oc');  end if; return new; end; $$;
create or replace function public.set_folio_rec() returns trigger language plpgsql as $$
begin if new.folio is null then new.folio := public.gen_folio('REC', 'seq_folio_rec'); end if; return new; end; $$;
create or replace function public.set_folio_enc() returns trigger language plpgsql as $$
begin if new.folio is null then new.folio := public.gen_folio('ENC', 'seq_folio_enc'); end if; return new; end; $$;
create or replace function public.set_folio_sur() returns trigger language plpgsql as $$
begin if new.folio is null then new.folio := public.gen_folio('SUR', 'seq_folio_sur'); end if; return new; end; $$;
create or replace function public.set_folio_inc() returns trigger language plpgsql as $$
begin if new.folio is null then new.folio := public.gen_folio('INC', 'seq_folio_inc'); end if; return new; end; $$;

create trigger trg_oc_folio
  before insert on ordenes_compra
  for each row execute function public.set_folio_oc();

create trigger trg_recepcion_folio
  before insert on recepciones
  for each row execute function public.set_folio_rec();

create trigger trg_encartuchado_folio
  before insert on encartuchados
  for each row execute function public.set_folio_enc();

create trigger trg_surtido_folio
  before insert on surtidos
  for each row execute function public.set_folio_sur();

create trigger trg_incidencia_folio
  before insert on incidencias
  for each row execute function public.set_folio_inc();
