-- ============================================================================
-- Campañas de temporada: el sabor cambia cuatro veces al año.
--
-- Hoy sustituir un producto en una máquina de receta deja el menú mintiendo:
-- la receta apunta a la tolva por NÚMERO, así que el polvo cambia y la bebida
-- sigue llamándose igual. Alguien tiene que acordarse de renombrarla a mano, y
-- con Halloween, Navidad y primavera encima, ese "alguien se acuerda" falla.
--
-- La campaña junta las dos mitades en un solo acto: Mariana define una vez qué
-- bebidas cambian de nombre, precio y gramaje; el operador ejecuta en campo; y
-- el sistema renombra la receta **cuando la última máquina ejecutó**, no antes.
--
-- Por qué al final y no al principio: las cinco máquinas de Planet Fitness
-- comparten la misma receta. Renombrar en cuanto la primera cambia dejaría a
-- las otras cuatro vendiendo "Pumpkin Latte" mientras siguen sirviendo chai.
-- El desfase no se puede eliminar —solo desaparece si las cinco cambian en el
-- mismo minuto—, pero así cae del lado seguro: el nombre nuevo aparece cuando
-- ya es cierto en todas.
--
-- El histórico no se toca: cada venta guarda el nombre de la bebida como texto
-- en el momento en que ocurrió, así que las ventas de chai seguirán diciendo
-- chai para siempre y las temporadas se pueden comparar entre sí.
-- ============================================================================

create table if not exists public.campanas_temporada (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  receta_id             uuid not null references public.recetas(id) on delete restrict,
  tolva_numero          integer not null check (tolva_numero between 1 and 8),
  producto_saliente_id  uuid not null references public.productos(id) on delete restrict,
  producto_entrante_id  uuid not null references public.productos(id) on delete restrict,

  estado                text not null default 'programada'
                          check (estado in ('programada','aplicada','cancelada')),

  notas                 text,
  creado_por            uuid references public.profiles(id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  aplicada_at           timestamptz,
  cancelada_at          timestamptz,
  cancelada_por         uuid references public.profiles(id) on delete restrict,
  motivo_cancelacion    text,

  constraint campana_productos_distintos
    check (producto_saliente_id <> producto_entrante_id),
  constraint campana_cancelada_con_motivo
    check (estado <> 'cancelada' or motivo_cancelacion is not null)
);

comment on table public.campanas_temporada is
  'Cambio de sabor por temporada en maquinas de receta. Junta la sustitucion fisica del polvo con el renombre de las bebidas, para que nadie tenga que acordarse de la segunda mitad.';

-- ── Las bebidas que cambian ─────────────────────────────────────────────────
-- Se guarda lo anterior además de lo nuevo: sin eso, cancelar una campaña a
-- medias dejaría el menú con nombres de una temporada que nunca ocurrió.
create table if not exists public.campana_bebidas (
  id                 uuid primary key default gen_random_uuid(),
  campana_id         uuid not null references public.campanas_temporada(id) on delete cascade,
  receta_item_id     uuid not null references public.receta_items(id) on delete restrict,

  nombre_anterior    text not null,
  precio_anterior    numeric(14,2),
  gramos_anteriores  integer,

  nombre_nuevo       text not null,
  precio_nuevo       numeric(14,2) check (precio_nuevo is null or precio_nuevo >= 0),
  -- Un sabor nuevo puede rendir distinto: si el pumpkin pide 10 g donde el chai
  -- pedía 8, se captura aquí y se aplica junto con el nombre.
  gramos_nuevos      integer check (gramos_nuevos is null or gramos_nuevos > 0),

  created_at         timestamptz not null default now(),

  unique (campana_id, receta_item_id)
);

comment on table public.campana_bebidas is
  'Que bebida pasa a llamarse como, con que precio y con cuantos gramos. Guarda tambien lo anterior para poder deshacer una campana cancelada.';

-- ── La sustitución sabe a qué campaña pertenece ─────────────────────────────
alter table public.sustituciones_tolva
  add column if not exists campana_id uuid
    references public.campanas_temporada(id) on delete set null;

create index if not exists sustituciones_campana_idx
  on public.sustituciones_tolva(campana_id) where campana_id is not null;

create index if not exists campanas_estado_idx
  on public.campanas_temporada(estado, created_at desc);

create trigger set_updated_at before update on public.campanas_temporada
  for each row execute function public.set_updated_at();

-- ── Aplicar la campaña ──────────────────────────────────────────────────────
-- Renombra las bebidas y ajusta precio y gramaje. Es idempotente: si ya se
-- aplicó, no hace nada. Se llama sola cuando la última máquina ejecuta, y
-- también se puede llamar a mano desde la pantalla.
create or replace function public.aplicar_campana_temporada(p_campana_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_estado text;
  v_tolva int;
  v_bebidas int := 0;
begin
  select estado, tolva_numero into v_estado, v_tolva
    from public.campanas_temporada where id = p_campana_id for update;

  if v_estado is null then
    raise exception 'La campaña no existe.';
  end if;
  if v_estado <> 'programada' then
    return jsonb_build_object('aplicada', false, 'motivo', 'La campaña ya está ' || v_estado);
  end if;

  -- Nombre y precio de la bebida.
  update public.receta_items ri
     set nombre = cb.nombre_nuevo,
         precio_venta = coalesce(cb.precio_nuevo, ri.precio_venta)
    from public.campana_bebidas cb
   where cb.campana_id = p_campana_id and ri.id = cb.receta_item_id;
  get diagnostics v_bebidas = row_count;

  -- Gramaje del ingrediente que sale de la tolva sustituida. Solo ese: los
  -- demás ingredientes de la bebida no los toca la campaña.
  update public.receta_item_ingredientes rii
     set gramos = cb.gramos_nuevos
    from public.campana_bebidas cb
   where cb.campana_id = p_campana_id
     and rii.receta_item_id = cb.receta_item_id
     and rii.tolva_numero = v_tolva
     and cb.gramos_nuevos is not null;

  update public.campanas_temporada
     set estado = 'aplicada', aplicada_at = now()
   where id = p_campana_id;

  return jsonb_build_object('aplicada', true, 'bebidas_renombradas', v_bebidas);
end;
$$;

revoke execute on function public.aplicar_campana_temporada(uuid) from public, anon;
grant execute on function public.aplicar_campana_temporada(uuid) to authenticated, service_role;

-- ── Que se aplique sola al terminar la última máquina ───────────────────────
-- Es la misma familia que las devoluciones automáticas: un efecto que dispara
-- un cambio de estado, no lógica de negocio escondida. La decisión ya la tomó
-- Mariana al armar la campaña; esto solo la ejecuta en el momento correcto.
create or replace function public.trg_campana_al_ejecutar_sustitucion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_pendientes int;
begin
  if new.campana_id is null or new.estado <> 'ejecutada' then
    return new;
  end if;
  if old.estado = 'ejecutada' then
    return new;  -- ya estaba ejecutada, no es la transición
  end if;

  select count(*) into v_pendientes
    from public.sustituciones_tolva
   where campana_id = new.campana_id and estado = 'pendiente';

  if v_pendientes = 0 then
    perform public.aplicar_campana_temporada(new.campana_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sustitucion_cierra_campana on public.sustituciones_tolva;
create trigger trg_sustitucion_cierra_campana
  after update on public.sustituciones_tolva
  for each row execute function public.trg_campana_al_ejecutar_sustitucion();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.campanas_temporada enable row level security;
alter table public.campana_bebidas    enable row level security;

create policy campanas_read on public.campanas_temporada
  for select to authenticated using (public.user_es_interno());
create policy campana_bebidas_read on public.campana_bebidas
  for select to authenticated using (public.user_es_interno());

create policy campanas_gestion on public.campanas_temporada
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role));

create policy campana_bebidas_gestion on public.campana_bebidas
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role));
