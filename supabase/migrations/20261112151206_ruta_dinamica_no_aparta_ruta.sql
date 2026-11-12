-- ============================================================================
-- 159 · La ruta del día ya no aparta la ruta del catálogo
--
-- Dirección lo dijo mejor que yo: "no debería ser la misma ruta porque ya es
-- una ruta dinámica, no fija". Tenía razón, y los datos lo confirman.
--
-- Qué está pasando realmente
-- --------------------------
-- `asignaciones_diarias` exige `ruta_id`, así que al aceptar una propuesta del
-- agente el código le inventa una: toma la ruta base a la que pertenece la
-- mayoría de las máquinas elegidas. Pero una ruta del agente no sale del
-- catálogo, sale de la cercanía y la urgencia del día, y cruza rutas base sin
-- ningún problema. La propuesta del 12-nov:
--
--   Diego    · 6 paradas → Centro 2, Poniente 2, Estado 1, Norte 1
--   Jonathan · 11 paradas → Centro 5, Poniente 2, Supervisor 2, Estado 1, Café 1
--
-- A los dos les tocó la etiqueta "RUTA CENTRO" — a Diego con 2 de 6 máquinas y
-- a Jonathan con 5 de 11. Una etiqueta que describe un tercio de la ruta.
--
-- Y como el índice único era (fecha, ruta_id), esa etiqueta inventada además
-- **apartaba** la ruta: el segundo operador chocaba contra el primero. Aceptar
-- esa propuesta era imposible, cancelando o sin cancelar, porque el conflicto
-- era de la propuesta consigo misma. Ninguna máquina se repite entre los dos
-- —el agente ya valida eso— así que no había nada real en conflicto.
--
-- Lo que cambia
-- -------------
-- El índice pasa a (fecha, ruta_id, operador_id). Sigue impidiendo lo que de
-- verdad está mal —la misma ruta, al mismo operador, dos veces el mismo día— y
-- deja de impedir que dos personas trabajen la misma zona, que es justamente
-- lo que el agente propone a propósito: Diego va a diagnóstico (Boturini,
-- Misterios, Clavería, las que llevan 240 h sin vender) y Jonathan a volumen
-- en el racimo denso del centro. Dos trabajos distintos, misma zona.
--
-- Históricamente esto nunca había pasado (0 días con una ruta repartida), pero
-- solo porque el candado lo impedía. Lo que sí pasa seguido es un operador con
-- dos asignaciones el mismo día —28 días, su ruta más una emergencia— así que
-- la unicidad por operador a secas tampoco servía.
--
-- La etiqueta de ruta se queda para que la pantalla siga mostrando algo
-- reconocible. Deja de ser una reserva y pasa a ser lo que siempre fue: una
-- descripción aproximada.
-- ============================================================================

drop index if exists public.asignaciones_diarias_fecha_ruta_vigente_idx;

create unique index if not exists asignaciones_diarias_fecha_ruta_operador_idx
  on public.asignaciones_diarias (fecha, ruta_id, operador_id)
  where estado <> 'cancelada';

comment on index public.asignaciones_diarias_fecha_ruta_operador_idx is
  'Un operador no puede tener dos veces la misma ruta el mismo día. Dos operadores sí pueden compartir ruta: las del agente son dinámicas y su ruta_id es una etiqueta derivada, no una reserva. Las canceladas no cuentan. Ver migración 20261112151206.';
