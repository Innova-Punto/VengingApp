-- ============================================================================
-- 24 · Vasos por máquina (consumible separado del planograma de tolvas)
-- Cada máquina tiene UN tipo de vaso, con su capacidad e inventario actual.
-- ============================================================================

alter table public.maquinas
  add column vaso_producto_id      uuid references public.productos(id) on delete restrict,
  add column vaso_capacidad_max    int  not null default 300 check (vaso_capacidad_max >= 0),
  add column vaso_inventario_actual int not null default 0   check (vaso_inventario_actual >= 0);

create index maquinas_vaso_producto_idx on public.maquinas(vaso_producto_id);

create or replace function public.validate_maquina_vaso_producto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo producto_tipo;
begin
  if new.vaso_producto_id is not null then
    select tipo into v_tipo
    from public.productos
    where id = new.vaso_producto_id;

    if v_tipo is null then
      raise exception 'vaso_producto_id no existe en productos';
    end if;
    if v_tipo <> 'vaso' then
      raise exception 'El producto asignado como vaso debe ser de tipo ''vaso'' (recibido: %)', v_tipo;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_maquina_vaso_producto() from public;
revoke execute on function public.validate_maquina_vaso_producto() from anon, authenticated;

create trigger trg_maquinas_validate_vaso
  before insert or update of vaso_producto_id on public.maquinas
  for each row execute function public.validate_maquina_vaso_producto();
