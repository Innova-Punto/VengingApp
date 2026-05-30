-- ============================================================================
-- 27 · IVA por item (tasa configurable por presentación/oc_item)
-- ============================================================================

alter table public.presentaciones_proveedor
  add column iva_tasa numeric(5,4) not null default 0.16
  check (iva_tasa >= 0 and iva_tasa <= 1);

alter table public.oc_items
  add column iva_tasa numeric(5,4) not null default 0.16
  check (iva_tasa >= 0 and iva_tasa <= 1);

comment on column public.presentaciones_proveedor.iva_tasa is
  'Tasa de IVA aplicable a esta presentación (0.00=exento, 0.08=frontera, 0.16=general)';
comment on column public.oc_items.iva_tasa is
  'Tasa de IVA usada en este item (snapshot desde la presentación al crear)';
comment on column public.oc_items.costo_unitario is
  'Costo unitario SIN IVA. El IVA se calcula a partir de iva_tasa.';

create or replace function public.recalcular_total_oc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oc_id    uuid;
  v_subtotal numeric(14,2);
  v_iva      numeric(14,2);
begin
  v_oc_id := coalesce(new.oc_id, old.oc_id);

  select
    coalesce(sum(subtotal_item), 0),
    coalesce(sum(round(subtotal_item * iva_tasa, 2)), 0)
  into v_subtotal, v_iva
  from public.oc_items
  where oc_id = v_oc_id;

  update public.ordenes_compra
     set subtotal = v_subtotal,
         iva      = v_iva,
         total    = v_subtotal + v_iva
   where id = v_oc_id;

  return coalesce(new, old);
end;
$$;
