-- ============================================================================
-- 101 · OC en divisa (USD) con tipo de cambio confirmable
--
-- Problema: el proveedor cotiza en USD y se paga 50/50 con TCs distintos;
-- el costo MXN real solo se conoce con el último depósito. Antes se
-- capturaba el MXN a mano (fuente de errores de costo en lotes/cierres).
--
-- Diseño (acordado con dirección):
--   - La OC puede ser MXN (flujo actual, sin cambios) o USD.
--   - En USD, los items se capturan con costo unitario EN USD
--     (oc_items.costo_unitario_divisa) y el MXN se calcula = divisa × TC.
--   - ordenes_compra.tipo_cambio es editable (TC provisional al crear;
--     TC real ponderado de los depósitos al confirmar).
--   - tc_confirmado: candado — una OC en divisa NO puede recibirse
--     (crear lotes) mientras el TC siga provisional. Trigger en recepciones.
--   - Los pagos/tesorería viven en otra app; aquí solo entra el TC final.
-- ============================================================================

alter table public.ordenes_compra
  add column if not exists tipo_cambio numeric(10,4)
    check (tipo_cambio is null or tipo_cambio > 0),
  add column if not exists tc_confirmado boolean not null default false;

comment on column public.ordenes_compra.tipo_cambio is
  'MXN por unidad de divisa (solo OCs con moneda <> MXN). Provisional al crear; se edita con el TC real ponderado de los pagos. Congelado tras la primera recepción.';
comment on column public.ordenes_compra.tc_confirmado is
  'true = compras capturó el TC real pagado. Una OC en divisa no puede recibirse sin esto (trg_recepcion_valida_tc).';

alter table public.oc_items
  add column if not exists costo_unitario_divisa numeric(12,6)
    check (costo_unitario_divisa is null or costo_unitario_divisa >= 0);

comment on column public.oc_items.costo_unitario_divisa is
  'Costo unitario SIN IVA en la divisa de la OC (ej. USD). costo_unitario (MXN) = costo_unitario_divisa × ordenes_compra.tipo_cambio.';

-- Candado: una OC en divisa extranjera no puede recibirse con TC provisional
create or replace function public.validar_tc_en_recepcion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_moneda text;
  v_confirmado boolean;
begin
  select moneda, tc_confirmado into v_moneda, v_confirmado
    from public.ordenes_compra where id = new.oc_id;

  if coalesce(v_moneda, 'MXN') <> 'MXN' and not coalesce(v_confirmado, false) then
    raise exception
      'La OC está en % con tipo de cambio provisional. Confirma el TC real pagado en el detalle de la OC antes de recibir.',
      v_moneda;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_recepcion_valida_tc on public.recepciones;
create trigger trg_recepcion_valida_tc
  before insert on public.recepciones
  for each row execute function public.validar_tc_en_recepcion();
