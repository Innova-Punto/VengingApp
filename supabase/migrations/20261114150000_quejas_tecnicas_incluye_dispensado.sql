-- ============================================================================
-- 161 · "Queja técnica" deja de ser solo un problema de cobro
--
-- El prompt del agente dice: si `quejas_tecnicas_30d` es 3 o más, es un
-- componente descompuesto y va para el supervisor. Delta marcaba **0** las tres
-- veces que corrió el agente, teniendo siete quejas de dispensado en 30 días.
--
-- La vista solo contaba cinco tipos, todos de cobro y terminal. Lo que dejaba
-- fuera, en los últimos 90 días:
--
--   máquina da agua     53   ← bebida aguada: dosificación
--   vaso vacío          28
--   bebida incompleta   23
--   vaso atorado         9
--   ------------------------
--   113 de 124 quejas, el 91%
--
-- Y son justo las que produce una máquina descalibrada. El indicador que debía
-- escalar máquinas descompuestas era ciego a la falla más común que tenemos:
-- en todo el parque, CERO máquinas llegaban a 3.
--
-- Con los tipos de dispensado adentro, 5 de 72 máquinas disparan el criterio.
-- Delta queda en 7, el doble que la siguiente. Se queda fuera lo que no delata
-- un componente roto: `otro`, `mal_olor`, `producto_mal_estado`.
--
-- Nota de por qué el contador de 30 días importa más que `quejas_abiertas`:
-- una queja se cierra al pagarla, así que resolverle al usuario borra la
-- evidencia de que la máquina sigue descompuesta. De las siete de Delta, cinco
-- estaban cerradas y pagadas.
-- ============================================================================

create or replace view public.v_quejas_por_maquina as
 SELECT m.id AS maquina_id,
    m.serie,
    m.alias,
    count(*) FILTER (WHERE q.estado <> ALL (ARRAY['cerrada_resuelta'::queja_estado, 'cerrada_sin_respuesta'::queja_estado, 'no_procede'::queja_estado])) AS quejas_abiertas,
    count(*) FILTER (WHERE q.fecha_reporte >= (now() - '30 days'::interval)) AS quejas_30d,
    count(*) FILTER (WHERE q.fecha_reporte >= (now() - '30 days'::interval) AND (q.tipo = ANY (ARRAY[
        'cobro_sin_producto'::queja_tipo, 'cobro_duplicado'::queja_tipo,
        'terminal_no_pasa'::queja_tipo, 'touchscreen_no_sirve'::queja_tipo,
        'maquina_en_error'::queja_tipo,
        'maquina_da_agua'::queja_tipo, 'bebida_incompleta'::queja_tipo,
        'vaso_vacio'::queja_tipo, 'vaso_atorado'::queja_tipo,
        'vaso_atrapado_puerta'::queja_tipo]))) AS quejas_tecnicas_30d,
    max(q.fecha_reporte) AS ultima_queja,
    round(sum(COALESCE(q.monto_autorizado, 0::numeric)) FILTER (WHERE q.fecha_reporte >= (now() - '30 days'::interval)), 2) AS pagado_30d
   FROM maquinas m
     JOIN quejas q ON q.maquina_id = m.id
  GROUP BY m.id, m.serie, m.alias;

comment on view public.v_quejas_por_maquina is
  'Quejas por máquina. quejas_tecnicas_30d cuenta las que delatan un componente descompuesto: cobro y terminal, MÁS las de dispensado (bebida aguada o incompleta, vaso vacío o atorado). Antes solo contaba cobro y terminal, que son 7 de cada 124 quejas: una máquina descalibrada marcaba 0 y nunca escalaba. Ver migración 20261114150000.';
