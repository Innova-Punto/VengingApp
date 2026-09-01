-- ============================================================================
-- Puesto operativo: distingue operador de supervisor
--
-- OJO con la diferencia, que es la razón de que esto sea una columna aparte y
-- no un `app_role` nuevo:
--
--   · `user_roles.role` (app_role) es el rol de ACCESO: qué pantallas puede
--     abrir y qué puede escribir. Diego necesita `operador` ahí para usar la
--     PWA de campo — hacer check-in, pesar, surtir. Eso no cambia.
--   · `operadores_ruteo.puesto` es el CARGO: qué papel juega en la operación.
--
-- Si lo hubiéramos metido como app_role, cambiarle el cargo a alguien le
-- cambiaría los permisos, y un supervisor dejaría de poder trabajar en campo.
--
-- Para qué sirve: el agente de ruteo ya distinguía a Diego por
-- `reserva_incidencias` y `max_paradas_normales`, pero esos son parámetros
-- numéricos. Nombrar el puesto le da al prompt un concepto con el que razonar
-- —"Diego es supervisor, atiende incidencias y acompaña"— en vez de tener que
-- inferirlo de dos banderas. Y deja lugar a reglas futuras del tipo "escala al
-- supervisor" sin volver a tocar el esquema.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'puesto_operativo') then
    create type public.puesto_operativo as enum ('operador', 'supervisor');
  end if;
end $$;

alter table public.operadores_ruteo
  add column if not exists puesto public.puesto_operativo not null default 'operador';

comment on column public.operadores_ruteo.puesto is
  'Cargo en la operación, NO el rol de acceso. El permiso vive en user_roles.role; un supervisor conserva su rol operador para poder trabajar en campo.';

update public.operadores_ruteo
   set puesto = 'supervisor'
 where operador_id = (select id from public.profiles
                       where email = 'serviciotecnico@innovaypunto.com');
