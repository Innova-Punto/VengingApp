-- ============================================================================
-- Valor recibido de una OC — lo que de verdad se debe pagar
--
-- Problema (OC-000030, ago-2026): el proveedor canceló un renglón completo
-- (Isopure chocolate, $28,478.00 con IVA) y surtió el resto. La OC conserva el
-- monto PEDIDO —correcto, es el documento comercial— pero no existía en ningún
-- lado el monto RECIBIDO, y contabilidad cuadra el pago contra la OC. Cerrarla
-- como incompleta tampoco ayudaba: `cerrarOcIncompleta` solo cambia el estado y
-- guarda el motivo, sin tocar los totales. El riesgo era pagar de más.
--
-- Decisión de diseño: NO se sobrescriben `subtotal`, `iva` ni `total`. Esas
-- siguen siendo lo que se pidió, porque la OC es la evidencia de lo que se le
-- ordenó al proveedor y de que incumplió. Se agregan tres columnas paralelas
-- con lo recibido, y quedan ambas verdades.
--
-- Compatibilidad con la integración de contabilidad: se verificó en
-- pg_stat_statements que el rol `tesoreria_ro` consulta siempre con columnas
-- nombradas —`select id, folio, proveedor_id, fecha_emision, estado, subtotal,
-- iva, total from ordenes_compra`— y no usa `select *` en ninguna consulta.
-- Agregar columnas no altera ninguna de sus lecturas actuales; empezará a usar
-- las nuevas cuando decida apuntar a ellas.
-- ============================================================================

-- ── 1. Columnas ──────────────────────────────────────────────────────────────
alter table public.ordenes_compra
  add column if not exists subtotal_recibido numeric(14,2) not null default 0,
  add column if not exists iva_recibido      numeric(14,2) not null default 0,
  add column if not exists total_recibido    numeric(14,2) not null default 0;

comment on column public.ordenes_compra.subtotal_recibido is
  'Valor sin IVA de lo REALMENTE recibido (suma de oc_items.recibido x costo_unitario). Para pagar se usa esta, no `subtotal`, que es lo pedido.';
comment on column public.ordenes_compra.iva_recibido is
  'IVA correspondiente a lo realmente recibido.';
comment on column public.ordenes_compra.total_recibido is
  'Monto a pagar al proveedor: subtotal_recibido + iva_recibido. Difiere de `total` cuando el proveedor no surtió completo.';

-- ── 2. Recálculo ─────────────────────────────────────────────────────────────
-- Se prorratea `subtotal_item` por la fracción recibida, NO se multiplica
-- `recibido x costo_unitario`. Motivo: `costo_unitario` está redondeado a 6
-- decimales y `subtotal_item` es el valor bueno. En renglones de mucha cantidad
-- ese redondeo se amplifica — en OC-000023, con 83,600 unidades a 0.614877
-- guardadas como 0.610000, la diferencia era de $407.45 en una orden recibida
-- completa. Prorrateando, un renglón recibido al 100% devuelve exactamente su
-- `subtotal_item`.
create or replace function public.recalcular_valor_recibido_oc(p_oc_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.ordenes_compra oc
     set subtotal_recibido = coalesce(v.sub, 0),
         iva_recibido      = coalesce(v.iva, 0),
         total_recibido    = coalesce(v.sub, 0) + coalesce(v.iva, 0)
    from (
      select round(sum(i.subtotal_item * i.recibido / nullif(i.cantidad, 0)), 2) as sub,
             round(sum(i.subtotal_item * i.recibido / nullif(i.cantidad, 0)
                       * coalesce(i.iva_tasa, 0)), 2) as iva
        from public.oc_items i
       where i.oc_id = p_oc_id
    ) v
   where oc.id = p_oc_id;
$$;

revoke all on function public.recalcular_valor_recibido_oc(uuid) from public;

-- ── 3. Se mantiene solo, en cada recepción ───────────────────────────────────
-- Va dentro del trigger que ya incrementa `recibido` y mueve el estado de la OC,
-- para que el valor esté correcto desde la primera recepción parcial y no
-- dependa de que alguien cierre la orden.
create or replace function public.handle_recepcion_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oc_id uuid;
  v_oc_items_total int;
  v_oc_items_completos int;
  v_producto_id uuid;
  v_producto_tipo producto_tipo;
  v_costo_por_gramo numeric(12,6);
begin
  -- 1) incrementar recibido
  update public.oc_items
     set recibido = recibido + new.presentaciones_recibidas
   where id = new.oc_item_id
   returning oc_id into v_oc_id;

  if v_oc_id is null then
    raise exception 'oc_item % no existe', new.oc_item_id;
  end if;

  -- 2) recalcular estado de la OC
  select count(*), count(*) filter (where recibido >= cantidad)
    into v_oc_items_total, v_oc_items_completos
    from public.oc_items
   where oc_id = v_oc_id;

  update public.ordenes_compra
     set estado = case
       when v_oc_items_completos >= v_oc_items_total then 'recibida'::oc_estado
       else 'parcial'::oc_estado
     end
   where id = v_oc_id
     and estado in ('enviada'::oc_estado, 'parcial'::oc_estado);

  -- 2b) recalcular el valor recibido (lo que se debe pagar)
  perform public.recalcular_valor_recibido_oc(v_oc_id);

  -- 3) insertar en kardex
  select p.id, p.tipo, l.costo_por_gramo
    into v_producto_id, v_producto_tipo, v_costo_por_gramo
    from public.lotes l
    join public.productos p on p.id = l.producto_id
   where l.id = new.lote_id;

  insert into public.movimientos_inventario (
    tipo, producto_id, lote_id, presentacion,
    gramos, cantidad_vasos,
    costo_por_gramo_snapshot, valor_movimiento,
    referencia_tabla, referencia_id
  ) values (
    'recepcion'::movimiento_tipo,
    v_producto_id,
    new.lote_id,
    case when v_producto_tipo = 'polvo' then 'granel'::mov_presentacion
         else 'vaso'::mov_presentacion end,
    coalesce(new.peso_total_gramos, 0),
    coalesce(new.unidades_totales, 0),
    v_costo_por_gramo,
    case when v_producto_tipo = 'polvo'
         then round(coalesce(new.peso_total_gramos,0) * v_costo_por_gramo, 2)
         else round(coalesce(new.unidades_totales,0) * v_costo_por_gramo, 2)
    end,
    'recepcion_items',
    new.id
  );

  return new;
end;
$$;

-- ── 4. Backfill del histórico ────────────────────────────────────────────────
-- Las OCs ya recibidas quedan con su valor recibido igual al pedido (recibieron
-- completo); las que están en cero se quedan en cero hasta que se capture su
-- recepción.
do $$
declare r record;
begin
  for r in select id from public.ordenes_compra loop
    perform public.recalcular_valor_recibido_oc(r.id);
  end loop;
end $$;
