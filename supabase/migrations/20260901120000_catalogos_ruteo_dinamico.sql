-- ============================================================================
-- Catálogos base para el ruteo dinámico por agente
--
-- Prepara el terreno para que un agente programado arme las rutas diarias.
-- Esta migración NO cambia cómo opera la app hoy: son tablas nuevas que ningún
-- código consulta todavía, más dos columnas que quedan vacías. Planeación sigue
-- asignando con el mismo botón de siempre.
--
-- Contexto medido sobre 125 jornadas limpias (45 días, sep-2026), excluyendo
-- las que cerró el proceso automático de medianoche porque el operador no hizo
-- checkout — esas sesgaban la duración hacia arriba:
--   · 8.7 paradas por jornada, 6.12 h de duración real
--   · 24.8 min dentro de la máquina
--   · ~14 min fijos por cambio de máquina (estacionar, entrar, salir)
--   · ~21 km/h de manejo real (la velocidad puerta a puerta de 6.9 km/h mezcla
--     manejo con ese costo fijo, y no sirve para estimar)
-- De ahí sale que caben ~9 paradas en 8 horas, no 11. El 11 queda como techo.
--
-- Decisión de diseño: `ruta_maquinas` deja de determinar quién visita qué. No
-- se borra —queda como histórico y como respaldo— pero el agente no la lee.
-- Ningún operador vuelve a tener máquinas propias, Diego incluido.
-- ============================================================================

-- ── 1. Centro de distribución ────────────────────────────────────────────────
-- Tabla propia y no una fila en `ubicaciones`, porque esa tabla cuelga de
-- `clientes` y el CEDIS no pertenece a ningún cliente.
create table if not exists public.centros_distribucion (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  direccion       text,
  lat             numeric(10,7),
  lng             numeric(10,7),
  minutos_carga   int not null default 20,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.centros_distribucion is
  'Punto de salida de todas las rutas. Los operadores pasan aquí cada mañana por cartuchos.';
comment on column public.centros_distribucion.minutos_carga is
  'Tiempo de carga de cartuchos antes de salir. No incluye el traslado a la primera parada.';

-- ── 2. Vehículos ─────────────────────────────────────────────────────────────
-- Se llama `vehiculos` y no `activos` a propósito: `activo` ya es el nombre de
-- la columna de baja lógica en casi todas las tablas, y "activo" en contabilidad
-- significa activo fijo — el socio lee esta base para conciliar pagos.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'vehiculo_tipo') then
    create type public.vehiculo_tipo as enum ('moto', 'camioneta');
  end if;
end $$;

create table if not exists public.vehiculos (
  id                    uuid primary key default gen_random_uuid(),
  tipo                  public.vehiculo_tipo not null,
  identificador         text not null,
  capacidad_cartuchos   int,
  regresa_a_resguardo   boolean not null default false,
  centro_id             uuid references public.centros_distribucion(id) on delete restrict,
  notas                 text,
  activo                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column public.vehiculos.regresa_a_resguardo is
  'Define la geometría de la ruta. En verdadero el recorrido cierra en el CEDIS (ciclo); en falso termina donde convenga (abierto), porque el operador se lleva el vehículo a casa.';
comment on column public.vehiculos.capacidad_cartuchos is
  'Tope de cartuchos por jornada. Restringe cuántas máquinas críticas caben en una ruta.';

-- ── 3. Parámetros de ruteo por operador ──────────────────────────────────────
create table if not exists public.operadores_ruteo (
  operador_id             uuid primary key references public.profiles(id) on delete restrict,
  vehiculo_id             uuid references public.vehiculos(id) on delete restrict,
  horas_jornada           numeric(4,2) not null default 8,
  max_paradas             int not null default 11,
  max_paradas_normales    int,
  reserva_incidencias     boolean not null default false,
  activo                  boolean not null default true,
  notas                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on column public.operadores_ruteo.max_paradas is
  'Techo duro de paradas. La restricción que realmente manda es horas_jornada: con los tiempos medidos caben ~9, no 11.';
comment on column public.operadores_ruteo.max_paradas_normales is
  'Tope de visitas de surtido regular. Null = sin tope. Diego lo tiene en 3 porque el resto de su jornada se reserva para incidencias y quejas.';
comment on column public.operadores_ruteo.reserva_incidencias is
  'El operador atiende incidencias además de surtir. Su capacidad de surtido se topa con max_paradas_normales.';

-- ── 4. Trazabilidad de lo que decide el agente ───────────────────────────────
-- Sin esto no hay auditoría, y sin auditoría un plan no determinista no debería
-- entrar a producción: hay que poder responder "¿por qué me mandó ahí ayer?".
alter table public.asignacion_maquinas
  add column if not exists orden_sugerido int,
  add column if not exists justificacion  text;

comment on column public.asignacion_maquinas.orden_sugerido is
  'Secuencia propuesta de la parada dentro de la jornada.';
comment on column public.asignacion_maquinas.justificacion is
  'Por qué esta máquina entró hoy. Lo escribe el agente; queda para auditar la decisión.';

alter table public.asignacion_maquinas
  drop constraint if exists asignacion_maquinas_origen_check;
alter table public.asignacion_maquinas
  add constraint asignacion_maquinas_origen_check
  check (origen = any (array['base_ruta'::text, 'agregada_excepcion'::text,
                             'sugerencia_dinamica'::text, 'agente'::text]));

-- ── 5. Constantes de operación ───────────────────────────────────────────────
-- Van en config_global —que hasta hoy estaba vacía— para poder afinarlas sin
-- tocar código conforme se acumule medición.
insert into public.config_global (clave, valor, tipo_dato, descripcion) values
  ('ruteo_min_en_sitio',        '24.8', 'numero', 'Minutos promedio dentro de la máquina. Medido sobre 125 jornadas limpias.'),
  ('ruteo_min_fijos_parada',    '14',   'numero', 'Minutos fijos por cambio de máquina: estacionar, entrar, salir, desestacionar.'),
  ('ruteo_velocidad_kmh',       '21',   'numero', 'Velocidad de manejo real, ya descontado el costo fijo por parada.'),
  ('ruteo_horas_jornada',       '8',    'numero', 'Jornada laboral objetivo.'),
  ('ruteo_paradas_objetivo',    '9',    'numero',     'Paradas que caben de verdad en la jornada. 11 es techo, no meta.')
on conflict do nothing;

-- ── 6. Alta de los datos reales ──────────────────────────────────────────────
do $$
declare
  v_centro uuid;
  v_moto_j uuid; v_moto_g uuid; v_moto_m uuid; v_camioneta uuid;
begin
  insert into public.centros_distribucion (nombre, direccion, lat, lng, minutos_carga)
  values ('CEDIS Romero Rubio',
          'Gral. Maclovio Herrera 123, Romero Rubio, Venustiano Carranza, 15400 Ciudad de México, CDMX',
          19.4424631, -99.1011553, 20)
  returning id into v_centro;

  -- Las motos se van a casa del operador: recorrido abierto.
  insert into public.vehiculos (tipo, identificador, capacidad_cartuchos, regresa_a_resguardo, centro_id, notas)
  values ('moto', 'MOTO-1', 20, false, v_centro, 'Actualizar identificador con placas reales')
  returning id into v_moto_j;
  insert into public.vehiculos (tipo, identificador, capacidad_cartuchos, regresa_a_resguardo, centro_id, notas)
  values ('moto', 'MOTO-2', 20, false, v_centro, 'Actualizar identificador con placas reales')
  returning id into v_moto_g;
  insert into public.vehiculos (tipo, identificador, capacidad_cartuchos, regresa_a_resguardo, centro_id, notas)
  values ('moto', 'MOTO-3', 20, false, v_centro, 'Actualizar identificador con placas reales')
  returning id into v_moto_m;

  -- La camioneta se resguarda en el CEDIS: recorrido cerrado. Política nueva.
  insert into public.vehiculos (tipo, identificador, capacidad_cartuchos, regresa_a_resguardo, centro_id, notas)
  values ('camioneta', 'CAMIONETA-1', null, true, v_centro,
          'Capacidad de cartuchos pendiente de definir. Actualizar identificador con placas reales.')
  returning id into v_camioneta;

  insert into public.operadores_ruteo
    (operador_id, vehiculo_id, horas_jornada, max_paradas, max_paradas_normales, reserva_incidencias, notas)
  values
    ((select id from public.profiles where email = 'operador1@innovaypunto.com'), v_moto_j, 8, 11, null, false, null),
    ((select id from public.profiles where email = 'operador3@innovaypunto.com'), v_moto_g, 8, 11, null, false, null),
    ((select id from public.profiles where email = 'operador2@innovaypunto.com'), v_moto_m, 8, 11, null, false, null),
    ((select id from public.profiles where email = 'serviciotecnico@innovaypunto.com'), v_camioneta, 8, 11, 3, true,
     'Supervisor. Tope de 3 visitas de surtido; el resto de la jornada se reserva para incidencias y quejas.')
  on conflict (operador_id) do nothing;
end $$;

-- ── 7. RLS ───────────────────────────────────────────────────────────────────
alter table public.centros_distribucion enable row level security;
alter table public.vehiculos            enable row level security;
alter table public.operadores_ruteo     enable row level security;

create policy centros_distribucion_read on public.centros_distribucion
  for select to authenticated using (public.user_es_interno());
create policy vehiculos_read on public.vehiculos
  for select to authenticated using (public.user_es_interno());
create policy operadores_ruteo_read on public.operadores_ruteo
  for select to authenticated using (public.user_es_interno());

create policy centros_distribucion_admin on public.centros_distribucion
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role));
create policy vehiculos_admin on public.vehiculos
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role));
create policy operadores_ruteo_admin on public.operadores_ruteo
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role));

-- ── 8. updated_at ────────────────────────────────────────────────────────────
create trigger set_updated_at before update on public.centros_distribucion
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.vehiculos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.operadores_ruteo
  for each row execute function public.set_updated_at();
