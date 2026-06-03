-- ============================================================================
-- 53 · Catálogo de recetas (bebidas preparadas) — Planet Fitness y similar
--
-- Modelo:
--   - recetas (catálogo, espejo de planogramas)
--   - receta_items: cada bebida (PA Code, nombre, precio)
--   - receta_item_ingredientes: qué tolva # da cuántos gramos
--
-- Al aplicar una receta a una máquina, se materializa en:
--   - maquina_items: PA Code → bebida en esa máquina
--   - maquina_item_ingredientes: tolva (concreta) y gramos por bebida
--
-- Para cada venta de bebida preparada, también guardamos el desglose:
--   - venta_ingredientes: 1 row por tolva consumida en la venta
--
-- Backwards compatible: las máquinas existentes (Smart Fit) NO tienen
-- entradas en maquina_items, así que el RPC procesar_venta_nayax sigue
-- usando el lookup actual (tolva.nayax_item_code = PA Code).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catálogo: recetas
-- ----------------------------------------------------------------------------

create table public.recetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  num_tolvas int not null default 8,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_recetas_updated_at
  before update on public.recetas
  for each row execute function public.set_updated_at();

-- Cada bebida (item de la receta)
create table public.receta_items (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete cascade,
  nayax_item_code text not null,
  nombre text not null,
  precio_venta numeric(14,2),
  created_at timestamptz not null default now(),
  unique (receta_id, nayax_item_code)
);

-- Cada ingrediente del item (tolva # + gramos)
create table public.receta_item_ingredientes (
  receta_item_id uuid not null references public.receta_items(id) on delete cascade,
  tolva_numero int not null check (tolva_numero > 0),
  gramos int not null check (gramos > 0),
  primary key (receta_item_id, tolva_numero)
);

-- ----------------------------------------------------------------------------
-- 2. Materialización en máquina
-- ----------------------------------------------------------------------------

create table public.maquina_items (
  id uuid primary key default gen_random_uuid(),
  maquina_id uuid not null references public.maquinas(id) on delete cascade,
  nayax_item_code text not null,
  nombre text not null,
  precio_venta numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (maquina_id, nayax_item_code)
);

create trigger trg_maquina_items_updated_at
  before update on public.maquina_items
  for each row execute function public.set_updated_at();

create table public.maquina_item_ingredientes (
  maquina_item_id uuid not null references public.maquina_items(id) on delete cascade,
  tolva_id uuid not null references public.tolvas(id) on delete restrict,
  gramos int not null check (gramos > 0),
  primary key (maquina_item_id, tolva_id)
);

create index maquina_item_ingredientes_tolva_idx
  on public.maquina_item_ingredientes(tolva_id);

-- ----------------------------------------------------------------------------
-- 3. Desglose de venta por tolva (para inventario y reportes)
-- ----------------------------------------------------------------------------

create table public.venta_ingredientes (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas_maquina(id) on delete cascade,
  tolva_id uuid not null references public.tolvas(id) on delete restrict,
  producto_id uuid references public.productos(id) on delete restrict,
  gramos int not null check (gramos > 0),
  costo numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create index venta_ingredientes_venta_idx on public.venta_ingredientes(venta_id);
create index venta_ingredientes_tolva_idx on public.venta_ingredientes(tolva_id);

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------

alter table public.recetas enable row level security;
alter table public.receta_items enable row level security;
alter table public.receta_item_ingredientes enable row level security;
alter table public.maquina_items enable row level security;
alter table public.maquina_item_ingredientes enable row level security;
alter table public.venta_ingredientes enable row level security;

create policy recetas_admin_all on public.recetas
  for all to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role))
  with check (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role));

create policy receta_items_admin_all on public.receta_items
  for all to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role))
  with check (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role));

create policy receta_item_ingredientes_admin_all on public.receta_item_ingredientes
  for all to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role))
  with check (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role));

create policy maquina_items_admin_all on public.maquina_items
  for all to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role))
  with check (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role));

create policy maquina_item_ingredientes_admin_all on public.maquina_item_ingredientes
  for all to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role))
  with check (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role));

-- Ventas: lectura para roles de operación; insert solo service_role
create policy venta_ingredientes_select on public.venta_ingredientes
  for select to authenticated
  using (
    user_has_role('admin'::app_role)
    or user_has_role('direccion'::app_role)
    or user_has_role('compras'::app_role)
    or user_has_role('planeador'::app_role)
    or user_has_role('almacen'::app_role)
  );

-- ----------------------------------------------------------------------------
-- 5. RPC procesar_venta_nayax actualizado para soportar recetas
-- ----------------------------------------------------------------------------

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

  -- Intento 1: lookup como receta (Planet Fitness y similar)
  select * into v_maquina_item from public.maquina_items
   where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code
   limit 1;

  if v_maquina_item is not null then
    -- Camino RECETA: descuenta de N tolvas según ingredientes

    -- Suma totales (gramos, costo) y se asignan al row de venta_maquina.
    -- producto_id de la venta queda null (es una bebida compuesta, no
    -- corresponde a un producto único). Para reportes se usa
    -- maquina_item.nombre o venta_ingredientes.
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

    -- Costo vaso (si la máquina vende vaso)
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

    -- Insert venta padre (tolva_id queda null, producto_id null en recetas)
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

    -- Insert desglose por tolva
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

  -- Intento 2 (legacy): lookup como tolva-directo (Smart Fit actual)
  select * into v_tolva from public.tolvas
   where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code
   limit 1;
  if v_tolva is null then
    raise exception 'PA Code % no encontrado en máquina % (ni como receta ni como tolva)',
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

  -- También guardamos el desglose en venta_ingredientes (1 row con la tolva)
  -- para que reportes por tolva incluyan también Smart Fit.
  insert into public.venta_ingredientes (
    venta_id, tolva_id, producto_id, gramos, costo
  ) values (
    v_venta_id, v_tolva.id, v_producto_id, v_gramos, v_costo_polvo
  );

  return v_venta_id;
end;
$$;

-- Backfill: poblar venta_ingredientes para ventas existentes (1 row por venta
-- existente, ya que todas las ventas hasta hoy son del modelo tolva-directo).
insert into public.venta_ingredientes (venta_id, tolva_id, producto_id, gramos, costo)
select v.id, v.tolva_id, v.producto_id, v.gramos_dispensados, v.costo_polvo
  from public.ventas_maquina v
 where v.tolva_id is not null
   and not exists (
     select 1 from public.venta_ingredientes vi where vi.venta_id = v.id
   );
