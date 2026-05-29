-- ============================================================================
-- 22 · Triggers de máquinas y tolvas
-- 1. Al crear una máquina, auto-crear N tolvas vacías.
-- 2. Al cambiar producto/gramaje/precio en una tolva, registrar en
--    planograma_historico y cerrar el registro vigente anterior.
-- ============================================================================

create or replace function public.create_tolvas_for_maquina()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i int;
begin
  for i in 1..new.num_tolvas loop
    insert into public.tolvas (maquina_id, numero, capacidad_max_g)
    values (new.id, i, new.capacidad_max_tolva_g);
  end loop;
  return new;
end;
$$;

revoke all on function public.create_tolvas_for_maquina() from public;
revoke execute on function public.create_tolvas_for_maquina() from anon, authenticated;

create trigger trg_maquina_create_tolvas
  after insert on public.maquinas
  for each row execute function public.create_tolvas_for_maquina();

create or replace function public.log_planograma_cambio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.producto_id is distinct from old.producto_id)
       or (new.gramaje_servicio is distinct from old.gramaje_servicio)
       or (new.precio_venta is distinct from old.precio_venta)
       or (new.nayax_item_code is distinct from old.nayax_item_code)
    then
      update public.planograma_historico
      set vigente_hasta = now()
      where maquina_id = new.maquina_id
        and tolva_numero = new.numero
        and vigente_hasta is null;

      if new.producto_id is not null
         and new.gramaje_servicio is not null
         and new.precio_venta is not null
      then
        insert into public.planograma_historico (
          maquina_id, tolva_numero, producto_id, gramaje_servicio,
          precio_venta, nayax_item_code, vigente_desde, motivo_cambio, creado_por
        ) values (
          new.maquina_id, new.numero, new.producto_id,
          new.gramaje_servicio, new.precio_venta, new.nayax_item_code,
          now(), 'cambio_planograma', auth.uid()
        );
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.log_planograma_cambio() from public;
revoke execute on function public.log_planograma_cambio() from anon, authenticated;

create trigger trg_tolva_log_planograma
  after update on public.tolvas
  for each row execute function public.log_planograma_cambio();
