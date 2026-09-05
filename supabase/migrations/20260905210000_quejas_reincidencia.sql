-- ============================================================================
-- Detección de reincidencia y quejas sin respaldo de venta
--
-- Dos tableros con propósitos distintos:
--
--   · Reincidencia — quién se queja seguido. Necesita identificar a la persona,
--     y con 4 dígitos no se puede: son 10,000 combinaciones, y con ~100 quejas
--     al mes la probabilidad de que dos personas distintas coincidan en el mes
--     es de 39%. Al año, la colisión es segura. Un tablero de reincidencia sobre
--     4 dígitos acusaría a gente inocente.
--
--   · Sin respaldo de venta — la señal objetiva, y la fuerte. Si alguien reclama
--     "me cobró y no salió nada" en una máquina a una hora, tiene que existir la
--     venta en Nayax. Si no existe, no hubo cargo. No depende de saber quién es.
--
-- Para lo primero se guarda un hash del teléfono completo. El número se captura
-- pero NO se persiste: la app lo normaliza a 10 dígitos, calcula el hash con una
-- sal que vive en variable de entorno —no en la base— y guarda solo el hash y
-- los últimos 4. Permite comparar exacto sin poder leer el número de vuelta.
--
-- La sal no se rota: si cambia, los hashes viejos dejan de empatar con los
-- nuevos y se pierde el histórico de reincidencia.
--
-- Ojo con la interpretación: reincidencia NO es fraude. Alguien que compra
-- diario en una máquina descompuesta se va a quejar legítimamente varias veces.
-- Por eso el cruce contra ventas manda sobre el conteo, y por eso la vista
-- reporta en cuántas máquinas DISTINTAS se quejó — cinco quejas de una máquina
-- es una máquina rota; cinco de cinco máquinas es otra cosa.
-- ============================================================================

alter table public.quejas
  add column if not exists telefono_hash text;

comment on column public.quejas.telefono_hash is
  'SHA-256 del teléfono normalizado a 10 dígitos más una sal de entorno. Permite detectar al mismo usuario sin guardar su número. Nunca se persiste el número completo.';

create index if not exists quejas_telefono_hash_idx on public.quejas(telefono_hash)
  where telefono_hash is not null;

-- ── Reincidencia por usuario ─────────────────────────────────────────────────
create or replace view public.v_quejas_reincidencia as
select q.telefono_hash,
       max(q.telefono_ultimos4) as telefono_ultimos4,
       count(*) as quejas_90d,
       count(distinct q.maquina_id) as maquinas_distintas,
       round(sum(coalesce(q.monto_autorizado, 0)), 2) as monto_pagado_90d,
       count(*) filter (where q.procede is false) as no_procedieron,
       round(100.0 * count(*) filter (where q.procede is false)
             / nullif(count(*) filter (where q.procede is not null), 0), 1) as pct_no_procede,
       min(q.fecha_reporte) as primera,
       max(q.fecha_reporte) as ultima,
       array_agg(distinct q.tipo::text) as tipos
  from public.quejas q
 where q.telefono_hash is not null
   and q.fecha_reporte >= now() - interval '90 days'
 group by q.telefono_hash
having count(*) >= 2;

comment on view public.v_quejas_reincidencia is
  'Usuarios con dos o más quejas en 90 días. maquinas_distintas es la columna que discrimina: repetir en la misma máquina apunta a una máquina rota, repetir en varias apunta al usuario.';

-- ── Quejas sin venta que las respalde ────────────────────────────────────────
-- Solo aplica a los tipos que afirman que hubo un cargo. Ventana de ±2 h
-- alrededor de la hora reportada, porque el usuario rara vez da la hora exacta.
create or replace view public.v_quejas_sin_venta as
select q.id as queja_id,
       q.folio,
       q.fecha_reporte,
       q.telefono_ultimos4,
       q.tipo::text as tipo,
       q.monto_reclamado,
       q.estado::text as estado,
       m.serie,
       m.alias,
       (select count(*)
          from public.ventas_maquina v
         where v.maquina_id = q.maquina_id
           and v.fecha_transaccion between q.fecha_reporte - interval '2 hours'
                                       and q.fecha_reporte + interval '2 hours'
       ) as ventas_en_ventana
  from public.quejas q
  join public.maquinas m on m.id = q.maquina_id
 where q.tipo in ('cobro_sin_producto', 'cobro_duplicado')
   and q.estado not in ('cerrada_resuelta', 'cerrada_sin_respuesta', 'no_procede');

comment on view public.v_quejas_sin_venta is
  'Quejas que afirman un cargo, con el conteo de ventas Nayax en ±2 h de la máquina. ventas_en_ventana = 0 significa que no hubo cobro: es la señal objetiva, y no depende de identificar al usuario.';

alter view public.v_quejas_reincidencia set (security_invoker = true);
alter view public.v_quejas_sin_venta    set (security_invoker = true);

insert into public.config_global (clave, valor, tipo_dato, descripcion) values
  ('quejas_reincidencia_umbral', '3', 'numero',
   'Quejas en 90 dias a partir de las cuales el caso se marca para revision antes de autorizar el pago. No bloquea: obliga a mirarlo.')
on conflict do nothing;
