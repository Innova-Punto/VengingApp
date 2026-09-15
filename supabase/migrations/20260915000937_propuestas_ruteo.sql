-- ============================================================================
-- Propuestas del agente de ruteo.
--
-- El agente **propone**; Mariana acepta o descarta. Si descarta, sigue teniendo
-- el botón de asignación dinámica de siempre — ese es el plan B y no se toca.
--
-- Cada corrida se guarda entera: el estado que se le dio al modelo, lo que
-- contestó, el plan ya ordenado y validado por código, y lo que costó. Sin eso
-- no hay forma de entender por qué propuso lo que propuso tres semanas después,
-- ni de medir si sus propuestas mejoran o empeoran.
--
-- La aritmética NO la hace el modelo: el orden de las paradas, los kilómetros y
-- la validación de la jornada los calcula código determinista. Un modelo arma
-- con toda confianza una ruta de once horas.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'propuesta_ruteo_estado') then
    create type public.propuesta_ruteo_estado as enum (
      'generada',    -- lista, esperando a que Mariana la mire
      'aceptada',    -- se convirtió en asignaciones reales
      'descartada',  -- Mariana prefirió armarla a mano
      'error'        -- la corrida falló; el error queda escrito
    );
  end if;
end $$;

create table if not exists public.propuestas_ruteo (
  id                uuid primary key default gen_random_uuid(),
  fecha             date not null,
  estado            public.propuesta_ruteo_estado not null default 'generada',
  fuente            text not null default 'cron' check (fuente in ('cron','manual')),

  -- Lo que se le dio al modelo y lo que contestó, tal cual. Es el único modo
  -- de reconstruir una decisión: el estado del parque cambia cada hora.
  estado_entrada    jsonb,
  respuesta         jsonb,
  -- El plan ya ordenado y recortado a la jornada por el código.
  plan              jsonb,
  escalamientos     jsonb,
  sin_atender       jsonb,
  notas             text,

  modelo            text,
  tokens_entrada    integer,
  tokens_salida     integer,
  costo_usd         numeric(10,4),
  duracion_ms       integer,
  error             text,

  generada_por      uuid references public.profiles(id) on delete restrict,
  created_at        timestamptz not null default now(),

  decidida_por      uuid references public.profiles(id) on delete restrict,
  decidida_at       timestamptz,
  motivo_descarte   text,

  -- Descartar exige decir por qué: ese texto es el que va a enseñar, con el
  -- tiempo, si el agente sirve o si sigue proponiendo lo mismo que no sirve.
  constraint propuesta_descarte_con_motivo
    check (estado <> 'descartada' or motivo_descarte is not null)
);

comment on table public.propuestas_ruteo is
  'Una corrida del agente de ruteo. El agente propone y planeación decide; el motivo de descarte es la retroalimentación que dice si el agente está sirviendo.';
comment on column public.propuestas_ruteo.estado_entrada is
  'Snapshot del parque que se le dio al modelo. Sin esto, una propuesta vieja es indescifrable: el inventario y las ventas ya cambiaron.';
comment on column public.propuestas_ruteo.plan is
  'Plan final: el del modelo, con las paradas reordenadas por cercanía y recortado a la jornada por código determinista.';

create index if not exists propuestas_ruteo_fecha_idx
  on public.propuestas_ruteo(fecha desc, created_at desc);

-- ── Parámetros que faltaban del prompt ──────────────────────────────────────
insert into public.config_global (clave, valor, tipo_dato, descripcion) values
  ('ruteo_horas_sin_venta_umbral', '12', 'numero',
   'Horas sin vender EN HORARIO DE OPERACION para considerar muda una maquina. 12 es el umbral que ya usa la alerta automatica; se mantiene uno solo para que la app y el agente no se contradigan.'),
  ('ruteo_vasos_minimo', '50', 'numero',
   'Vasos disponibles a partir de los cuales la maquina entra como criterio de visita.'),
  ('ruteo_garrafones_por_parada', '2', 'numero',
   'Garrafones que baja la camioneta por maquina: 40 L, lo que le cabe a un tanque medio vacio. Con 6 paradas da 12, justo la capacidad del vehiculo.'),
  ('ruteo_semanas_barrido_agua', '5', 'numero',
   'Semanas en las que el supervisor debe pasar por TODAS las maquinas. Es un barrido de SUPERVISION, no de agua: el objetivo es que el las revise todas en ese lapso; el agua es lo que lo lleva ahi. Se mide contra la ultima visita del supervisor, no contra la de cualquier operador. Las maquinas que consumen mas de un tanque en ese lapso las completa el operador comprando en la tienda; bajar ese gasto es el otro objetivo.')
on conflict do nothing;

-- La camioneta trabaja con otra logica: menos paradas y mas tiempo en cada una,
-- porque ademas de surtir atiende incidencias, quejas escaladas y el agua.
update public.operadores_ruteo
   set max_paradas = 6,
       notas = 'Supervisor con camioneta. Tope de 6 paradas: ademas de surtir atiende incidencias, quejas escaladas y reparte agua (2 garrafones por parada = 12, la capacidad del vehiculo). Lo que se le deja libre es su capacidad de reaccion.'
 where puesto = 'supervisor';

-- ── Venta diaria por máquina ────────────────────────────────────────────────
-- El desempate del prompt: entre dos máquinas igual de urgentes y de cercanas,
-- va primero la que más vende. Se calcula en la base y no en la app porque son
-- 30 mil ventas y no tiene caso traerlas para sumarlas afuera.
create or replace function public.venta_diaria_por_maquina_30d()
returns table (maquina_id uuid, venta_dia numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select v.maquina_id,
         round(sum(v.precio_sin_iva) / 30.0, 2) as venta_dia
    from public.ventas_maquina v
   where v.fecha_transaccion >= now() - interval '30 days'
   group by v.maquina_id;
$$;

comment on function public.venta_diaria_por_maquina_30d is
  'Venta diaria promedio sin IVA de los ultimos 30 dias. Insumo del agente de ruteo para desempatar entre maquinas igual de urgentes.';

revoke execute on function public.venta_diaria_por_maquina_30d() from public, anon;
grant execute on function public.venta_diaria_por_maquina_30d() to authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.propuestas_ruteo enable row level security;

create policy propuestas_ruteo_read on public.propuestas_ruteo
  for select to authenticated using (public.user_es_interno());

create policy propuestas_ruteo_gestion on public.propuestas_ruteo
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role));
