-- ============================================================================
-- 54 · Tipo de máquina (polvo_directo | preparado) + candados de integridad
--
-- Una máquina solo puede operar bajo UN modelo:
--   - polvo_directo: 1 tolva ↔ 1 PA Code (Smart Fit, actual)
--   - preparado: 1 PA Code ↔ N tolvas vía receta (Planet Fitness)
--
-- Candados:
--   1. CHECK en maquinas.tipo
--   2. Trigger en tolvas: no permite nayax_item_code en máquinas 'preparado'
--   3. Trigger en maquina_items: no permite insert si máquina es 'polvo_directo'
-- ============================================================================

alter table public.maquinas
  add column if not exists tipo text not null default 'polvo_directo';

alter table public.maquinas
  drop constraint if exists maquinas_tipo_check;
alter table public.maquinas
  add constraint maquinas_tipo_check
  check (tipo in ('polvo_directo', 'preparado'));

-- Trigger: bloquear nayax_item_code en tolvas si máquina es preparado
create or replace function public.check_tolva_nayax_code_tipo()
returns trigger
language plpgsql
as $$
declare v_tipo text;
begin
  if new.nayax_item_code is null then
    return new;
  end if;
  select m.tipo into v_tipo
    from public.maquinas m
   where m.id = new.maquina_id;
  if v_tipo = 'preparado' then
    raise exception 'Máquina es de tipo "preparado": el PA Code (nayax_item_code) se configura en la receta, no en la tolva.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tolva_nayax_code_tipo on public.tolvas;
create trigger trg_tolva_nayax_code_tipo
  before insert or update of nayax_item_code on public.tolvas
  for each row execute function public.check_tolva_nayax_code_tipo();

-- Trigger: bloquear inserts a maquina_items si máquina es polvo_directo
create or replace function public.check_maquina_items_tipo()
returns trigger
language plpgsql
as $$
declare v_tipo text;
begin
  select m.tipo into v_tipo
    from public.maquinas m
   where m.id = new.maquina_id;
  if v_tipo = 'polvo_directo' then
    raise exception 'Máquina es de tipo "polvo_directo": no se pueden definir recetas. Cambia el tipo a "preparado" primero.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_maquina_items_tipo on public.maquina_items;
create trigger trg_maquina_items_tipo
  before insert or update on public.maquina_items
  for each row execute function public.check_maquina_items_tipo();

-- RPC: si la máquina es 'preparado' y el PA Code no está en maquina_items,
-- error claro (no caer al fallback de tolva).
create or replace function public.procesar_venta_nayax(
  p_nayax_transaction_id text,
  p_nayax_machine_id text,
  p_nayax_item_code text,
  p_fecha_transaccion timestamptz,
  p_precio_bruto numeric,
  p_metodo_pago text default null,
  p_ticket_id text default null,
  p_sync_log_id uuid default null,
  p_comision_pct numeric default 0.0394
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_maquina record;
  v_tolva record;
  v_maquina_item record;
  v_cliente_id uuid;
  v_producto_id uuid;
  v_gramos int := 0;
  v_costo_polvo numeric(14,2) := 0;
  v_costo_vaso numeric(14,2) := 0;
  v_comision numeric(14,2);
  v_precio_neto numeric(14,2);
  v_utilidad numeric(14,2);
  v_margen numeric(8,4);
  v_cierre_id uuid;
  v_venta_id uuid;
  v_ingr record;
  v_costo_ingr numeric(14,2);
begin
  if p_nayax_transaction_id is null or p_nayax_transaction_id = '' then
    raise exception 'Falta nayax_transaction_id';
  end if;

  select id into v_venta_id from public.ventas_maquina
   where nayax_transaction_id = p_nayax_transaction_id;
  if v_venta_id is not null then return v_venta_id; end if;

  select * into v_maquina from public.maquinas
   where activo = true
     and (nayax_machine_id = p_nayax_machine_id or nayax_serial = p_nayax_machine_id)
   limit 1;
  if v_maquina is null then
    raise exception 'Máquina con nayax_machine_id % no encontrada', p_nayax_machine_id;
  end if;

  select u.cliente_id into v_cliente_id
    from public.ubicaciones u
   where u.id = v_maquina.ubicacion_id;

  -- Si la máquina es 'preparado', SOLO buscamos en maquina_items
  if v_maquina.tipo = 'preparado' then
    select * into v_maquina_item from public.maquina_items
     where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code
     limit 1;
    if v_maquina_item is null then
      raise exception 'PA Code % no encontrado como receta en máquina % (preparado)',
        p_nayax_item_code, v_maquina.serie;
    end if;

    for v_ingr in
      select mi.tolva_id, mi.gramos,
             t.producto_id as ingrediente_producto_id,
             coalesce(t.costo_promedio_g_actual, 0) as costo_g
        from public.maquina_item_ingredientes mi
        join public.tolvas t on t.id = mi.tolva_id
       where mi.maquina_item_id = v_maquina_item.id
    loop
      v_gramos := v_gramos + v_ingr.gramos;
      v_costo_ingr := round(v_ingr.gramos * v_ingr.costo_g, 2);
      v_costo_polvo := v_costo_polvo + v_costo_ingr;
    end loop;

    v_comision := round(p_precio_bruto * p_comision_pct, 2);
    v_precio_neto := round(p_precio_bruto - v_comision, 2);

    if v_maquina.vaso_producto_id is not null then
      select coalesce(
        sum(l.unidades_disponibles * l.costo_por_gramo)
        / nullif(sum(l.unidades_disponibles), 0),
        0
      )
      into v_costo_vaso
      from public.lotes l
      where l.producto_id = v_maquina.vaso_producto_id
        and l.activo = true
        and l.unidades_disponibles > 0;
      v_costo_vaso := round(v_costo_vaso, 2);
    end if;

    v_utilidad := round(v_precio_neto - v_costo_polvo - v_costo_vaso, 2);
    v_margen := case
      when v_precio_neto > 0 then round(v_utilidad / v_precio_neto * 100, 2)
      else null
    end;

    select id into v_cierre_id from public.cierres_mensuales
     where periodo_mes = extract(month from p_fecha_transaccion)::int
       and periodo_anio = extract(year from p_fecha_transaccion)::int
     limit 1;

    insert into public.ventas_maquina (
      nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id,
      fecha_transaccion, gramos_dispensados,
      precio_bruto, comision_nayax_estimada, precio_neto,
      costo_polvo, costo_vaso, utilidad_bruta, margen_porcentaje,
      metodo_pago, ticket_id_nayax, sync_log_id, cierre_id,
      notas
    ) values (
      p_nayax_transaction_id, v_maquina.id, null, null, v_cliente_id,
      p_fecha_transaccion, v_gramos,
      p_precio_bruto, v_comision, v_precio_neto,
      v_costo_polvo, v_costo_vaso, v_utilidad, v_margen,
      p_metodo_pago, p_ticket_id, p_sync_log_id, v_cierre_id,
      'Receta: ' || v_maquina_item.nombre
    ) returning id into v_venta_id;

    for v_ingr in
      select mi.tolva_id, mi.gramos,
             t.producto_id as ingrediente_producto_id,
             coalesce(t.costo_promedio_g_actual, 0) as costo_g
        from public.maquina_item_ingredientes mi
        join public.tolvas t on t.id = mi.tolva_id
       where mi.maquina_item_id = v_maquina_item.id
    loop
      insert into public.venta_ingredientes (
        venta_id, tolva_id, producto_id, gramos, costo
      ) values (
        v_venta_id, v_ingr.tolva_id, v_ingr.ingrediente_producto_id,
        v_ingr.gramos, round(v_ingr.gramos * v_ingr.costo_g, 2)
      );
    end loop;

    return v_venta_id;
  end if;

  -- Tipo polvo_directo: lookup por tolva.nayax_item_code (legacy / Smart Fit)
  select * into v_tolva from public.tolvas
   where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code
   limit 1;
  if v_tolva is null then
    raise exception 'PA Code % no encontrado en máquina % (polvo_directo)',
      p_nayax_item_code, v_maquina.serie;
  end if;

  v_producto_id := v_tolva.producto_id;
  v_gramos := coalesce(v_tolva.gramaje_servicio, 0);

  if v_gramos <= 0 then
    raise exception 'Tolva % no tiene gramaje_servicio configurado', v_tolva.id;
  end if;

  v_costo_polvo := round(v_gramos * coalesce(v_tolva.costo_promedio_g_actual, 0), 2);
  v_comision := round(p_precio_bruto * p_comision_pct, 2);
  v_precio_neto := round(p_precio_bruto - v_comision, 2);

  if v_maquina.vaso_producto_id is not null then
    select coalesce(
      sum(l.unidades_disponibles * l.costo_por_gramo)
      / nullif(sum(l.unidades_disponibles), 0),
      0
    )
    into v_costo_vaso
    from public.lotes l
    where l.producto_id = v_maquina.vaso_producto_id
      and l.activo = true
      and l.unidades_disponibles > 0;
    v_costo_vaso := round(v_costo_vaso, 2);
  end if;

  v_utilidad := round(v_precio_neto - v_costo_polvo - v_costo_vaso, 2);
  v_margen := case
    when v_precio_neto > 0 then round(v_utilidad / v_precio_neto * 100, 2)
    else null
  end;

  select id into v_cierre_id from public.cierres_mensuales
   where periodo_mes = extract(month from p_fecha_transaccion)::int
     and periodo_anio = extract(year from p_fecha_transaccion)::int
   limit 1;

  insert into public.ventas_maquina (
    nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id,
    fecha_transaccion, gramos_dispensados,
    precio_bruto, comision_nayax_estimada, precio_neto,
    costo_polvo, costo_vaso, utilidad_bruta, margen_porcentaje,
    metodo_pago, ticket_id_nayax, sync_log_id, cierre_id
  ) values (
    p_nayax_transaction_id, v_maquina.id, v_tolva.id, v_producto_id, v_cliente_id,
    p_fecha_transaccion, v_gramos,
    p_precio_bruto, v_comision, v_precio_neto,
    v_costo_polvo, v_costo_vaso, v_utilidad, v_margen,
    p_metodo_pago, p_ticket_id, p_sync_log_id, v_cierre_id
  ) returning id into v_venta_id;

  insert into public.venta_ingredientes (
    venta_id, tolva_id, producto_id, gramos, costo
  ) values (
    v_venta_id, v_tolva.id, v_producto_id, v_gramos, v_costo_polvo
  );

  return v_venta_id;
end;
$$;
