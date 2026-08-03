-- ============================================================================
-- 97 · Módulo de máquinas de SERVICIO (Smart Energy)
--
-- Máquinas 100% servicio: sin tolvas, sin inventario, sin kardex. El operador
-- hace check-in, ejecuta un CHECKLIST configurable (plantilla), sube fotos y
-- recaba FIRMA del líder Smart Fit. Nada de esto toca inventario/ventas.
--
-- 1) maquinas.tipo acepta 'servicio' (era CHECK polvo_directo|preparado)
-- 2) checklist_plantillas / checklist_items  (framework configurable)
-- 3) servicio_visitas / servicio_respuestas  (folio SRV-xxxxxx)
-- 4) bucket evidencias-servicio + policies
-- 5) seed: plantilla "Servicio Smart Energy v1" (checklist del Excel)
-- ============================================================================

-- 1) Tipo de máquina 'servicio'
alter table public.maquinas drop constraint if exists maquinas_tipo_check;
alter table public.maquinas add constraint maquinas_tipo_check
  check (tipo = any (array['polvo_directo'::text, 'preparado'::text, 'servicio'::text]));

-- 2) Framework de checklist configurable
create table if not exists public.checklist_plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  version int not null default 1,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.checklist_plantillas(id) on delete cascade,
  seccion text not null,
  orden int not null,
  nombre text not null,
  tipo text not null default 'bien_mal' check (tipo in ('bien_mal','texto','numero')),
  obligatorio boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists checklist_items_plantilla_idx
  on public.checklist_items(plantilla_id, seccion, orden);

alter table public.checklist_plantillas enable row level security;
alter table public.checklist_items enable row level security;

-- Lectura: cualquier usuario autenticado con rol (operadores incluidos)
create policy checklist_plantillas_read on public.checklist_plantillas
  for select to authenticated using (true);
create policy checklist_items_read on public.checklist_items
  for select to authenticated using (true);
-- Escritura: solo admin/dirección
create policy checklist_plantillas_write on public.checklist_plantillas
  for all to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role))
  with check (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role));
create policy checklist_items_write on public.checklist_items
  for all to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role))
  with check (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role));

-- 3) Visitas de servicio
create table if not exists public.servicio_visitas (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  check_in_id uuid not null unique references public.check_ins(id),
  maquina_id uuid not null references public.maquinas(id),
  plantilla_id uuid not null references public.checklist_plantillas(id),
  operador_id uuid not null references public.profiles(id),
  fecha timestamptz not null default now(),
  inventario_sf text,
  producto_repuesto boolean not null default false,
  cantidad_repuesta int,
  foto_general_url text,
  lider_nombre text,
  firma_url text,
  firma_no_disponible boolean not null default false,
  firma_motivo text,
  observaciones text,
  created_at timestamptz not null default now(),
  -- Firma obligatoria salvo escape explícito con motivo
  constraint servicio_firma_valida check (
    (firma_url is not null and lider_nombre is not null)
    or (firma_no_disponible and firma_motivo is not null)
  )
);
create index if not exists servicio_visitas_maquina_idx on public.servicio_visitas(maquina_id, fecha desc);
create index if not exists servicio_visitas_operador_idx on public.servicio_visitas(operador_id, fecha desc);

create table if not exists public.servicio_respuestas (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.servicio_visitas(id) on delete cascade,
  item_id uuid not null references public.checklist_items(id),
  estado text check (estado in ('bien','mal','na')),
  descripcion text,
  foto_url text,
  valor text,
  created_at timestamptz not null default now(),
  unique (visita_id, item_id)
);

-- Folio SRV-000001
create sequence if not exists servicio_visitas_folio_seq;
create or replace function public.set_folio_servicio_visita()
returns trigger language plpgsql as $$
begin
  if new.folio is null then
    new.folio := 'SRV-' || lpad(nextval('servicio_visitas_folio_seq')::text, 6, '0');
  end if;
  return new;
end $$;
drop trigger if exists trg_servicio_visitas_folio on public.servicio_visitas;
create trigger trg_servicio_visitas_folio
  before insert on public.servicio_visitas
  for each row execute function public.set_folio_servicio_visita();

alter table public.servicio_visitas enable row level security;
alter table public.servicio_respuestas enable row level security;

-- Lectura: roles de oficina, o el operador dueño de la visita
create policy servicio_visitas_read on public.servicio_visitas
  for select to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)
      or user_has_role('planeador'::app_role) or user_has_role('almacen'::app_role)
      or operador_id = auth.uid());
create policy servicio_respuestas_read on public.servicio_respuestas
  for select to authenticated
  using (exists (select 1 from public.servicio_visitas v
                  where v.id = visita_id
                    and (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)
                      or user_has_role('planeador'::app_role) or user_has_role('almacen'::app_role)
                      or v.operador_id = auth.uid())));

-- Inserción: el operador de la visita (o admin/dirección)
create policy servicio_visitas_insert on public.servicio_visitas
  for insert to authenticated
  with check (operador_id = auth.uid()
           or user_has_role('admin'::app_role) or user_has_role('direccion'::app_role));
create policy servicio_respuestas_insert on public.servicio_respuestas
  for insert to authenticated
  with check (exists (select 1 from public.servicio_visitas v
                       where v.id = visita_id
                         and (v.operador_id = auth.uid()
                           or user_has_role('admin'::app_role) or user_has_role('direccion'::app_role))));

-- 4) Bucket de evidencias de servicio (privado)
insert into storage.buckets (id, name, public)
values ('evidencias-servicio', 'evidencias-servicio', false)
on conflict (id) do nothing;

create policy "evidencias_servicio_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias-servicio');
create policy "evidencias_servicio_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'evidencias-servicio');
create policy "evidencias_servicio_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'evidencias-servicio');

-- 5) Seed: plantilla "Servicio Smart Energy v1" (fiel al checklist Excel)
do $$
declare v_pl uuid;
begin
  select id into v_pl from public.checklist_plantillas where nombre = 'Servicio Smart Energy' and version = 1;
  if v_pl is not null then return; end if;

  insert into public.checklist_plantillas (nombre, version, activo, notas)
  values ('Servicio Smart Energy', 1, true,
          'Checklist de servicio para máquinas Smart Energy (limpieza, equipo, biométrico, mueble, producto). Origen: Check_list_Energy.xlsx')
  returning id into v_pl;

  insert into public.checklist_items (plantilla_id, seccion, orden, nombre) values
    -- Limpieza
    (v_pl, 'Limpieza', 1, 'Exterior mueble'),
    (v_pl, 'Limpieza', 2, 'Interior mueble'),
    (v_pl, 'Limpieza', 3, 'Trampas insectos'),
    (v_pl, 'Limpieza', 4, 'Bolsa de jarabe'),
    (v_pl, 'Limpieza', 5, 'Mangueras de jarabe'),
    (v_pl, 'Limpieza', 6, 'Conexiones para bolsas de jarabe'),
    -- Equipo
    (v_pl, 'Equipo', 1, 'Funcionando'),
    (v_pl, 'Equipo', 2, 'Botoneras'),
    (v_pl, 'Equipo', 3, 'Membranas'),
    (v_pl, 'Equipo', 4, 'Bombas'),
    (v_pl, 'Equipo', 5, 'Mangueras'),
    (v_pl, 'Equipo', 6, 'Conexiones plásticas'),
    (v_pl, 'Equipo', 7, 'Boquillas de jarabe'),
    (v_pl, 'Equipo', 8, 'O-ring de conexiones'),
    (v_pl, 'Equipo', 9, 'Enfriador'),
    (v_pl, 'Equipo', 10, 'Estructura del equipo'),
    (v_pl, 'Equipo', 11, 'Chapas'),
    (v_pl, 'Equipo', 12, 'Tarjeta electrónica'),
    -- Biométrico
    (v_pl, 'Biométrico', 1, 'Funcionando'),
    (v_pl, 'Biométrico', 2, 'Estructura del equipo'),
    (v_pl, 'Biométrico', 3, 'Lector biométrico'),
    (v_pl, 'Biométrico', 4, 'Cables de conexión'),
    (v_pl, 'Biométrico', 5, 'Señal'),
    -- Mueble
    (v_pl, 'Mueble', 1, 'Estructura'),
    (v_pl, 'Mueble', 2, 'Vinil'),
    (v_pl, 'Mueble', 3, 'Chapas'),
    (v_pl, 'Mueble', 4, 'Llaves'),
    -- Producto
    (v_pl, 'Producto', 1, 'Estado del producto (en caja, acomodado)'),
    (v_pl, 'Producto', 2, 'Caducidad visible y vigente'),
    -- Prueba de funcionamiento (del procedimiento Word)
    (v_pl, 'Prueba de funcionamiento', 1, 'Compra de prueba realizada'),
    (v_pl, 'Prueba de funcionamiento', 2, 'Biométrico funciona y producto dispensa');
end $$;
