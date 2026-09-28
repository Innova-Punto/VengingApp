-- ============================================================================
-- La campaña edita la receta completa, no solo la tolva que se sustituye.
--
-- Mariana lo vio en la primera revisión: la campaña solo dejaba cambiar los
-- gramos de la tolva sustituida. Pero un sabor de temporada no siempre es "el
-- mismo trago con otro polvo" — el pumpkin puede pedir 30 g de leche donde el
-- chai pedía 25, o menos azúcar, o un ingrediente que la bebida anterior no
-- usaba. Sin esto, tendría que entrar a editar la receta a mano después, que es
-- exactamente lo que la campaña venía a evitar.
--
-- Ahora la campaña guarda la receta completa que quedará: un renglón por
-- ingrediente, con lo que hay hoy y lo que va a quedar. Un ingrediente con
-- `gramos_nuevos` nulo se elimina de la bebida; uno que no existía hoy
-- (`gramos_anteriores` nulo) se agrega.
-- ============================================================================

create table if not exists public.campana_bebida_ingredientes (
  id                 uuid primary key default gen_random_uuid(),
  campana_bebida_id  uuid not null references public.campana_bebidas(id) on delete cascade,
  tolva_numero       integer not null check (tolva_numero between 1 and 8),
  -- Null = la bebida no usaba esa tolva: el ingrediente es nuevo.
  gramos_anteriores  integer check (gramos_anteriores is null or gramos_anteriores > 0),
  -- Null = el ingrediente sale de la bebida.
  gramos_nuevos      integer check (gramos_nuevos is null or gramos_nuevos > 0),
  created_at         timestamptz not null default now(),

  unique (campana_bebida_id, tolva_numero),
  -- Un renglón que no agrega, no quita y no cambia nada no debería existir.
  constraint ingrediente_cambia_algo
    check (gramos_anteriores is distinct from gramos_nuevos)
);

comment on table public.campana_bebida_ingredientes is
  'La receta completa que va a quedar tras la campana. gramos_nuevos nulo = el ingrediente sale; gramos_anteriores nulo = el ingrediente entra.';

-- ── Aplicar: ahora escribe la receta entera ─────────────────────────────────
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
  v_ingredientes int := 0;
begin
  select estado, tolva_numero into v_estado, v_tolva
    from public.campanas_temporada where id = p_campana_id for update;

  if v_estado is null then
    raise exception 'La campana no existe.';
  end if;
  if v_estado <> 'programada' then
    return jsonb_build_object('aplicada', false, 'motivo', 'La campana ya esta ' || v_estado);
  end if;

  -- Nombre y precio.
  update public.receta_items ri
     set nombre = cb.nombre_nuevo,
         precio_venta = coalesce(cb.precio_nuevo, ri.precio_venta)
    from public.campana_bebidas cb
   where cb.campana_id = p_campana_id and ri.id = cb.receta_item_id;
  get diagnostics v_bebidas = row_count;

  -- Ingredientes que salen de la bebida.
  delete from public.receta_item_ingredientes rii
   using public.campana_bebida_ingredientes cbi
   join public.campana_bebidas cb on cb.id = cbi.campana_bebida_id
   where cb.campana_id = p_campana_id
     and rii.receta_item_id = cb.receta_item_id
     and rii.tolva_numero = cbi.tolva_numero
     and cbi.gramos_nuevos is null;

  -- Los que entran o cambian de gramaje.
  insert into public.receta_item_ingredientes (receta_item_id, tolva_numero, gramos)
  select cb.receta_item_id, cbi.tolva_numero, cbi.gramos_nuevos
    from public.campana_bebida_ingredientes cbi
    join public.campana_bebidas cb on cb.id = cbi.campana_bebida_id
   where cb.campana_id = p_campana_id and cbi.gramos_nuevos is not null
      on conflict (receta_item_id, tolva_numero)
      do update set gramos = excluded.gramos;
  get diagnostics v_ingredientes = row_count;

  -- Compatibilidad con campanas armadas antes de esta migracion, que solo
  -- traian el gramaje de la tolva sustituida.
  if v_ingredientes = 0 then
    update public.receta_item_ingredientes rii
       set gramos = cb.gramos_nuevos
      from public.campana_bebidas cb
     where cb.campana_id = p_campana_id
       and rii.receta_item_id = cb.receta_item_id
       and rii.tolva_numero = v_tolva
       and cb.gramos_nuevos is not null;
  end if;

  update public.campanas_temporada
     set estado = 'aplicada', aplicada_at = now()
   where id = p_campana_id;

  return jsonb_build_object(
    'aplicada', true,
    'bebidas_renombradas', v_bebidas,
    'ingredientes_ajustados', v_ingredientes
  );
end;
$$;

revoke execute on function public.aplicar_campana_temporada(uuid) from public, anon;
grant execute on function public.aplicar_campana_temporada(uuid) to authenticated, service_role;

alter table public.campana_bebida_ingredientes enable row level security;

create policy campana_ingredientes_read on public.campana_bebida_ingredientes
  for select to authenticated using (public.user_es_interno());

create policy campana_ingredientes_gestion on public.campana_bebida_ingredientes
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role));
