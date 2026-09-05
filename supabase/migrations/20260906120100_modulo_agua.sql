-- ============================================================================
-- Control de agua: garrafones en almacén y litros dentro de cada máquina.
--
-- Hasta hoy el agua era invisible: el operador compraba garrafones en la tienda
-- de junto y llenaba el tanque de 50 L de la máquina sin dejar rastro. Con la
-- camioneta, los garrafones salen del CEDIS y hay que saber cuántos entran,
-- cuántos salen a ruta y cuántos litros quedan en cada máquina.
--
-- Decisión de dirección (5-sep-2026): **el agua no se valúa.** No entra al
-- kardex (`movimientos_inventario`), no entra al COGS y no toca los cierres.
-- Por eso lleva sus propios libros, en unidades físicas: garrafones en almacén
-- y mililitros en máquina. El costo se puede anotar como referencia y no se
-- suma a nada.
--
-- Unidades: **mililitros enteros**, por la misma razón que los polvos van en
-- gramos enteros. Un garrafón son 20,000 ml; un tanque lleno, 50,000 ml; una
-- malteada, 300 ml.
-- ============================================================================

-- ── 1. El producto ───────────────────────────────────────────────────────────
alter table public.productos
  add column if not exists ml_por_unidad integer
    check (ml_por_unidad is null or ml_por_unidad > 0);

comment on column public.productos.ml_por_unidad is
  'Mililitros que rinde una unidad comprable. Solo aplica a tipo = agua (garrafón de 20 L = 20000).';

insert into public.productos (sku, nombre, tipo, unidad_medida, ml_por_unidad,
                              requiere_encartuchado, gramaje_cartucho_default, notas)
values ('AGUA-GARRAFON-20L', 'Garrafón de agua 20 L', 'agua', 'mililitros', 20000,
        false, 0, 'Insumo no valuado: se controla en unidades físicas, no entra al costeo.')
on conflict (sku) do nothing;

-- ── 2. El tanque de la máquina ───────────────────────────────────────────────
alter table public.maquinas
  add column if not exists requiere_agua boolean not null default true,
  add column if not exists agua_capacidad_ml integer not null default 50000
    check (agua_capacidad_ml >= 0);

comment on column public.maquinas.requiere_agua is
  'Las de tipo servicio (Smart Energy) no preparan bebida y no llevan agua.';
comment on column public.maquinas.agua_capacidad_ml is
  'Capacidad del tanque. 50 L de fábrica; se ajusta por máquina si difiere.';

update public.maquinas set requiere_agua = false where tipo = 'servicio';

-- El nivel NO se guarda como columna en `maquinas` a propósito. Un tanque baja
-- con cada venta, así que una columna sería un dato viejo desde el segundo
-- siguiente. El nivel vive en los eventos y el estimado al momento lo calcula
-- `v_agua_maquina` restando las ventas desde la última medición física —
-- el mismo criterio del pesaje de tolvas: solo lo medido es verdad.

-- ── 3. El vehículo ───────────────────────────────────────────────────────────
alter table public.vehiculos
  add column if not exists capacidad_garrafones integer
    check (capacidad_garrafones is null or capacidad_garrafones >= 0);

comment on column public.vehiculos.capacidad_garrafones is
  'Garrafones que caben por viaje. 0 = no puede llevar agua (las motos). Es un tope real: un garrafón de 20 L ocupa y pesa.';

update public.vehiculos set capacidad_garrafones = 12 where tipo = 'camioneta';
update public.vehiculos set capacidad_garrafones = 0  where tipo = 'moto';

-- ── 4. Parámetros ────────────────────────────────────────────────────────────
insert into public.config_global (clave, valor, tipo_dato, descripcion) values
  ('agua_ml_por_bebida',  '300',   'numero', 'Mililitros de agua por bebida servida. Base del consumo teórico.'),
  ('agua_ml_por_garrafon','20000', 'numero', 'Mililitros por garrafón. Debe coincidir con productos.ml_por_unidad del garrafón vigente.'),
  ('agua_dias_alerta',    '7',     'numero', 'Días de agua restante a partir de los cuales la máquina entra como criterio de ruta.')
on conflict do nothing;

-- ── 5. Garrafones en almacén ─────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'agua_almacen_mov') then
    create type public.agua_almacen_mov as enum (
      'entrada_compra',   -- llegaron garrafones al CEDIS
      'salida_ruta',      -- se cargaron a un vehículo
      'retorno_ruta',     -- regresaron sin usar
      'ajuste_conteo',    -- cuadre contra conteo físico
      'merma'             -- se rompió, se derramó
    );
  end if;
end $$;

create table if not exists public.agua_almacen_movimientos (
  id                uuid primary key default gen_random_uuid(),
  fecha             timestamptz not null default now(),
  tipo              public.agua_almacen_mov not null,
  -- Con signo: entradas positivas, salidas negativas. La existencia es la suma.
  garrafones        integer not null check (garrafones <> 0),
  -- Informativo: NO se suma a ningún costo ni entra a los cierres. Se captura
  -- desde el día uno a propósito — si mañana dirección decide costear el agua,
  -- el precio histórico ya va a estar aquí y el costeo se puede aplicar hacia
  -- atrás en lugar de arrancar de cero.
  costo_referencia  numeric(14,2) check (costo_referencia is null or costo_referencia >= 0),
  proveedor_id      uuid references public.proveedores(id) on delete restrict,
  proveedor_texto   text,
  asignacion_id     uuid references public.asignaciones_diarias(id) on delete set null,
  operador_id       uuid references public.profiles(id) on delete restrict,
  nota              text,
  created_by        uuid references public.profiles(id) on delete restrict,
  created_at        timestamptz not null default now(),

  -- El signo tiene que corresponder al tipo, o la existencia deja de significar algo
  constraint agua_almacen_signo_coherente check (
    (tipo in ('entrada_compra','retorno_ruta') and garrafones > 0)
    or (tipo in ('salida_ruta','merma') and garrafones < 0)
    or tipo = 'ajuste_conteo'
  )
);

comment on table public.agua_almacen_movimientos is
  'Libro de garrafones del CEDIS, en unidades. Deliberadamente fuera de movimientos_inventario: el agua no se valúa (decisión de dirección, sep-2026).';

create index if not exists agua_almacen_fecha_idx on public.agua_almacen_movimientos(fecha desc);

create or replace view public.v_agua_almacen as
select coalesce(sum(garrafones), 0)::int                                   as existencia_garrafones,
       coalesce(sum(garrafones) filter (where tipo = 'entrada_compra'
              and fecha >= now() - interval '30 days'), 0)::int            as comprados_30d,
       coalesce(-sum(garrafones) filter (where tipo = 'salida_ruta'
              and fecha >= now() - interval '30 days'), 0)::int            as salidos_ruta_30d,
       coalesce(-sum(garrafones) filter (where tipo = 'merma'
              and fecha >= now() - interval '30 days'), 0)::int            as merma_30d,
       max(fecha) filter (where tipo = 'entrada_compra')                   as ultima_compra
  from public.agua_almacen_movimientos;

alter view public.v_agua_almacen set (security_invoker = true);

-- ── 6. Agua dentro de la máquina ─────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'agua_evento_tipo') then
    create type public.agua_evento_tipo as enum (
      'carga',      -- el operador vació N garrafones en el tanque
      'medicion',   -- el operador reportó cuánto quedó: es el baseline
      'ajuste'      -- corrección de dirección, con nota
    );
  end if;
end $$;

create table if not exists public.agua_maquina_eventos (
  id            uuid primary key default gen_random_uuid(),
  maquina_id    uuid not null references public.maquinas(id) on delete restrict,
  fecha         timestamptz not null default now(),
  tipo          public.agua_evento_tipo not null,

  garrafones    integer check (garrafones is null or garrafones > 0),
  ml_cargados   integer check (ml_cargados is null or ml_cargados > 0),
  ml_medidos    integer check (ml_medidos is null or ml_medidos >= 0),
  -- Lo que el sistema esperaba encontrar al llegar. Se guarda al momento porque
  -- después ya no se puede reconstruir: las ventas siguen corriendo.
  ml_teoricos   integer,

  llenado_id    uuid references public.llenados(id) on delete set null,
  check_in_id   uuid references public.check_ins(id) on delete set null,
  operador_id   uuid references public.profiles(id) on delete restrict,
  nota          text,
  created_by    uuid references public.profiles(id) on delete restrict,
  created_at    timestamptz not null default now(),

  constraint agua_evento_carga_trae_cantidad check (
    tipo <> 'carga' or (garrafones is not null and ml_cargados is not null)),
  constraint agua_evento_medicion_trae_nivel check (
    tipo <> 'medicion' or ml_medidos is not null)
);

comment on table public.agua_maquina_eventos is
  'Lo que físicamente pasó con el agua de una máquina. Una medición fija el baseline; el consumo entre mediciones se calcula con las ventas, no se registra evento por venta.';
comment on column public.agua_maquina_eventos.ml_teoricos is
  'Nivel que el sistema esperaba. La diferencia contra ml_medidos es la fuga o el desperdicio: es el número que justifica todo este módulo.';

create index if not exists agua_eventos_maquina_idx on public.agua_maquina_eventos(maquina_id, fecha desc);

-- ── 7. Estado del agua por máquina ───────────────────────────────────────────
-- Fuente del criterio de agua del agente de ruteo y de la pantalla de planeación.
create or replace view public.v_agua_maquina as
with param as (
  select coalesce((select valor::numeric from public.config_global where clave = 'agua_ml_por_bebida'), 300) as ml_bebida
),
ultima as (
  select distinct on (maquina_id) maquina_id, fecha, ml_medidos
    from public.agua_maquina_eventos
   where tipo in ('medicion','ajuste') and ml_medidos is not null
   order by maquina_id, fecha desc
),
cargas as (
  select e.maquina_id, sum(e.ml_cargados) as ml
    from public.agua_maquina_eventos e
    left join ultima u on u.maquina_id = e.maquina_id
   where e.tipo = 'carga'
     and e.fecha > coalesce(u.fecha, '-infinity'::timestamptz)
   group by e.maquina_id
),
consumo as (
  select v.maquina_id, count(*) as ventas
    from public.ventas_maquina v
    join ultima u on u.maquina_id = v.maquina_id
   where v.fecha_transaccion > u.fecha
   group by v.maquina_id
),
ritmo as (
  select maquina_id, count(*)::numeric / 30 as ventas_dia
    from public.ventas_maquina
   where fecha_transaccion >= now() - interval '30 days'
   group by maquina_id
)
select m.id                                   as maquina_id,
       m.serie,
       m.alias,
       m.agua_capacidad_ml,
       u.fecha                                as ultima_medicion,
       u.ml_medidos                           as ml_ultima_medicion,
       coalesce(c.ml, 0)::int                 as ml_cargados_desde,
       coalesce(co.ventas, 0)::int            as ventas_desde,
       -- Nulo cuando nunca se ha medido: "no sé" es un dato, un cero falso no.
       case when u.fecha is null then null
            else greatest(u.ml_medidos + coalesce(c.ml, 0)
                          - (coalesce(co.ventas, 0) * p.ml_bebida), 0)::int
       end                                    as ml_estimado,
       round(coalesce(r.ventas_dia, 0) * p.ml_bebida)::int as ml_por_dia,
       case when u.fecha is null or coalesce(r.ventas_dia, 0) = 0 then null
            else round(greatest(u.ml_medidos + coalesce(c.ml, 0)
                                - (coalesce(co.ventas, 0) * p.ml_bebida), 0)
                       / (r.ventas_dia * p.ml_bebida), 1)
       end                                    as dias_para_vaciarse,
       (u.fecha is null)                      as sin_medicion
  from public.maquinas m
  cross join param p
  left join ultima  u  on u.maquina_id  = m.id
  left join cargas  c  on c.maquina_id  = m.id
  left join consumo co on co.maquina_id = m.id
  left join ritmo   r  on r.maquina_id  = m.id
 where m.activo and m.requiere_agua;

alter view public.v_agua_maquina set (security_invoker = true);

comment on view public.v_agua_maquina is
  'Agua estimada al momento por máquina. sin_medicion = nunca se ha reportado nivel: el estimado no existe, no es cero.';

-- ── 8. RLS ───────────────────────────────────────────────────────────────────
alter table public.agua_almacen_movimientos enable row level security;
alter table public.agua_maquina_eventos     enable row level security;

create policy agua_almacen_read on public.agua_almacen_movimientos
  for select to authenticated using (public.user_es_interno());
create policy agua_eventos_read on public.agua_maquina_eventos
  for select to authenticated using (public.user_es_interno());

-- El almacén es de almacén, dirección y admin.
create policy agua_almacen_gestion on public.agua_almacen_movimientos
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('almacen'::app_role) or public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('almacen'::app_role) or public.user_has_role('planeador'::app_role));

-- El evento de máquina lo levanta quien está en campo.
create policy agua_eventos_captura on public.agua_maquina_eventos
  for insert to authenticated
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role) or public.user_has_role('almacen'::app_role)
      or public.user_has_role('operador'::app_role));

-- Corregir un evento ya registrado es de dirección: es el rastro de la fuga.
create policy agua_eventos_correccion on public.agua_maquina_eventos
  for update to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role));
