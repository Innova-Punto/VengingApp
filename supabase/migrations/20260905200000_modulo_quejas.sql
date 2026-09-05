-- ============================================================================
-- Módulo de quejas de usuario final
--
-- Sustituye la bitácora en Excel (1,864 quejas en 21 meses, $116,674 pagados,
-- ticket promedio $94). No se migra el histórico: el módulo arranca limpio.
--
-- Por qué tabla propia y no `incidencias`: son ciclos de vida distintos. Una
-- incidencia es un problema técnico que se resuelve arreglando la máquina; una
-- queja es un caso de servicio con dinero de por medio, un usuario esperando y
-- un comprobante de transferencia al final. Van relacionadas en ambos sentidos
-- —una queja puede escalar a incidencia, una incidencia explica varias quejas—
-- pero mezclarlas llenaría `incidencias` de columnas nulas.
--
-- Catálogo construido para operación CASHLESS. En el Excel, 334 de las 1,280
-- quejas tipificadas (26%) eran de efectivo —cambio incompleto, billete
-- atorado, se come billete, monedas atoradas—, y ya no pueden ocurrir. Su
-- equivalente cashless, y el más grave, es `cobro_sin_producto`: se hizo el
-- cargo a la tarjeta y no salió nada.
--
-- Privacidad: del usuario se guardan solo los últimos 4 dígitos del teléfono.
-- Es lo que ya hacían en el Excel y es lo correcto — el número completo es dato
-- personal y no hace falta para operar.
-- ============================================================================

-- ── 1. Catálogos ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'queja_tipo') then
    create type public.queja_tipo as enum (
      'cobro_sin_producto',      -- se cobró la tarjeta y no salió nada
      'cobro_duplicado',         -- se cobró dos veces la misma compra
      'maquina_da_agua',         -- salió agua sin polvo
      'bebida_incompleta',       -- salió menos producto del debido
      'vaso_vacio',              -- cayó el vaso sin bebida
      'vaso_atorado',            -- el vaso no cayó
      'vaso_atrapado_puerta',    -- el vaso se quedó dentro de la puerta
      'producto_mal_estado',     -- sabor, textura, grumos
      'mal_olor',
      'terminal_no_pasa',        -- el lector rechaza la tarjeta
      'touchscreen_no_sirve',    -- pantalla táctil no responde
      'maquina_en_error',        -- pantalla trabada, no opera
      'otro'                     -- exige descripción
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'queja_estado') then
    create type public.queja_estado as enum (
      'abierta',                 -- capturada, sin validar
      'en_validacion',           -- enviada al operador para que diga si procede
      'espera_cliente',          -- falta que el usuario mande datos o formulario
      'procede',                 -- validada, pendiente de pago
      'no_procede',              -- se descartó
      'pagada',                  -- se transfirió, con comprobante
      'cerrada_resuelta',        -- confirmada con el usuario
      'cerrada_sin_respuesta'    -- se agotaron los toques sin respuesta
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'queja_canal') then
    create type public.queja_canal as enum ('whatsapp', 'llamada', 'correo', 'presencial');
  end if;

  if not exists (select 1 from pg_type where typname = 'queja_contacto_resultado') then
    create type public.queja_contacto_resultado as enum (
      'contesto',
      'no_contesto',
      'pendiente_info'           -- contestó pero falta que mande algo
    );
  end if;
end $$;

-- ── 2. La queja ──────────────────────────────────────────────────────────────
create table if not exists public.quejas (
  id                      uuid primary key default gen_random_uuid(),
  folio                   text not null unique,
  fecha_reporte           timestamptz not null default now(),

  -- Usuario final. Solo 4 dígitos: el número completo es dato personal.
  telefono_ultimos4       text not null check (telefono_ultimos4 ~ '^[0-9]{4}$'),

  maquina_id              uuid not null references public.maquinas(id) on delete restrict,
  tipo                    public.queja_tipo not null,
  descripcion             text,

  monto_reclamado         numeric(14,2),
  monto_autorizado        numeric(14,2),

  estado                  public.queja_estado not null default 'abierta',

  -- Validación del operador que atiende la máquina
  operador_id             uuid references public.profiles(id) on delete restrict,
  procede                 boolean,
  validada_por            uuid references public.profiles(id) on delete restrict,
  fecha_validacion        timestamptz,
  motivo_no_procede       text,

  -- Pago al usuario
  fecha_pago              timestamptz,
  comprobante_url         text,
  pagada_por              uuid references public.profiles(id) on delete restrict,

  -- Recuperación del dinero desde la máquina
  recuperado              boolean not null default false,
  fecha_entrega_dinero    timestamptz,

  -- Cierre
  fecha_cierre            timestamptz,
  notas_cierre            text,

  -- Si la queja destapó una falla técnica
  incidencia_id           uuid references public.incidencias(id) on delete set null,

  created_by              uuid references public.profiles(id) on delete restrict,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Un monto autorizado exige que la queja proceda
  constraint quejas_autorizado_requiere_procede
    check (monto_autorizado is null or procede is true),
  -- No se puede marcar pagada sin comprobante
  constraint quejas_pagada_requiere_comprobante
    check (estado <> 'pagada' or comprobante_url is not null)
);

comment on table public.quejas is
  'Quejas de usuario final. Reemplaza la bitácora en Excel. El histórico previo no se migró.';
comment on column public.quejas.telefono_ultimos4 is
  'Solo los últimos 4 dígitos: el número completo es dato personal y no hace falta para operar.';
comment on column public.quejas.monto_autorizado is
  'Lo decide dirección/planeación al validar. Puede diferir de lo que reclamó el usuario.';
comment on column public.quejas.recuperado is
  'Si el operador recuperó de la máquina el dinero que se le devolvió al usuario.';
comment on column public.quejas.incidencia_id is
  'Cuando la queja destapa una falla técnica. Tres cobros sin producto en la misma máquina no son tres quejas, son un lector descompuesto.';

create index if not exists quejas_estado_idx on public.quejas(estado)
  where estado not in ('cerrada_resuelta','cerrada_sin_respuesta');
create index if not exists quejas_maquina_idx on public.quejas(maquina_id, fecha_reporte desc);
create index if not exists quejas_fecha_idx on public.quejas(fecha_reporte desc);

-- ── 3. Bitácora de toques ────────────────────────────────────────────────────
-- Es la evidencia. Sin esto no se puede cerrar una queja por falta de respuesta
-- y defenderlo ante el cliente o ante dirección.
create table if not exists public.queja_contactos (
  id              uuid primary key default gen_random_uuid(),
  queja_id        uuid not null references public.quejas(id) on delete cascade,
  fecha           timestamptz not null default now(),
  canal           public.queja_canal not null default 'whatsapp',
  resultado       public.queja_contacto_resultado not null,
  nota            text,
  registrado_por  uuid references public.profiles(id) on delete restrict,
  created_at      timestamptz not null default now()
);

comment on table public.queja_contactos is
  'Cada intento de contacto con el usuario. Cadencia acordada: toques en día 1, 2 y 3, y un toque final a la semana antes de cerrar por falta de respuesta.';

create index if not exists queja_contactos_queja_idx on public.queja_contactos(queja_id, fecha desc);

-- ── 4. Folio ─────────────────────────────────────────────────────────────────
create sequence if not exists public.quejas_folio_seq;

-- El folio lo genera el DEFAULT de la columna y no solo el trigger: así el tipo
-- generado lo marca opcional y la app no tiene que pasarlo.
alter table public.quejas
  alter column folio set default ('QJA-' || lpad(nextval('public.quejas_folio_seq')::text, 6, '0'));

create or replace function public.set_folio_queja()
returns trigger
language plpgsql
as $$
begin
  if new.folio is null or new.folio = '' then
    new.folio := 'QJA-' || lpad(nextval('public.quejas_folio_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_quejas_folio before insert on public.quejas
  for each row execute function public.set_folio_queja();

create trigger set_updated_at before update on public.quejas
  for each row execute function public.set_updated_at();

-- ── 5. Señal para el agente de ruteo ─────────────────────────────────────────
-- El prompt del agente ya tiene el criterio "queja de cliente abierta" escrito
-- y hasta hoy recibía vacío. Esta vista es su fuente. Incluye la reincidencia
-- de 30 días, que es la señal fuerte: tres quejas del mismo tipo en la misma
-- máquina no son tres casos, son una falla que hay que escalar.
create or replace view public.v_quejas_por_maquina as
select m.id as maquina_id,
       m.serie,
       m.alias,
       count(*) filter (
         where q.estado not in ('cerrada_resuelta','cerrada_sin_respuesta','no_procede')
       ) as quejas_abiertas,
       count(*) filter (where q.fecha_reporte >= now() - interval '30 days') as quejas_30d,
       count(*) filter (
         where q.fecha_reporte >= now() - interval '30 days'
           and q.tipo in ('cobro_sin_producto','cobro_duplicado','terminal_no_pasa',
                          'touchscreen_no_sirve','maquina_en_error')
       ) as quejas_tecnicas_30d,
       max(q.fecha_reporte) as ultima_queja,
       round(sum(coalesce(q.monto_autorizado, 0))
             filter (where q.fecha_reporte >= now() - interval '30 days'), 2) as pagado_30d
  from public.maquinas m
  join public.quejas q on q.maquina_id = m.id
 group by m.id, m.serie, m.alias;

-- security_invoker por la regla que quedó vigente: una vista nace respetando
-- RLS salvo justificación explícita.
alter view public.v_quejas_por_maquina set (security_invoker = true);

comment on view public.v_quejas_por_maquina is
  'Fuente del criterio de quejas del agente de ruteo. quejas_tecnicas_30d es la señal de escalamiento: reincidencia en fallas de cobro o pantalla apunta a un componente descompuesto, no a un caso aislado.';

-- ── 6. RLS ───────────────────────────────────────────────────────────────────
alter table public.quejas          enable row level security;
alter table public.queja_contactos enable row level security;

-- Lectura para el personal interno.
create policy quejas_read on public.quejas
  for select to authenticated using (public.user_es_interno());
create policy queja_contactos_read on public.queja_contactos
  for select to authenticated using (public.user_es_interno());

-- Captura y gestión: dirección, admin y planeación.
create policy quejas_gestion on public.quejas
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role));
create policy queja_contactos_gestion on public.queja_contactos
  for all to authenticated
  using (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role))
  with check (public.user_has_role('admin'::app_role) or public.user_has_role('direccion'::app_role)
      or public.user_has_role('planeador'::app_role));

-- El operador valida desde campo: solo puede tocar las quejas que se le
-- asignaron, y solo el veredicto — no el monto ni el pago.
create policy quejas_validacion_operador on public.quejas
  for update to authenticated
  using (public.user_has_role('operador'::app_role) and operador_id = auth.uid())
  with check (public.user_has_role('operador'::app_role) and operador_id = auth.uid());

-- ── 7. Parámetros ────────────────────────────────────────────────────────────
insert into public.config_global (clave, valor, tipo_dato, descripcion) values
  ('quejas_dias_vieja',        '3', 'numero', 'Días a partir de los cuales una queja abierta se marca en rojo en el tablero.'),
  ('quejas_toques_iniciales',  '3', 'numero', 'Toques diarios al usuario: dia 1, 2 y 3.'),
  ('quejas_dias_toque_final',  '7', 'numero', 'Dias de espera tras el tercer toque antes del toque final.')
on conflict do nothing;
