-- ============================================================================
-- 150 · `utilidad_bruta` acepta nulo
--
-- Qué se rompió
-- -------------
-- La migración 149 dejó entrar las ventas sin PA Code con `utilidad_bruta` y
-- `margen_porcentaje` en null, a propósito: sin saber qué bebida se despachó
-- no hay costo, y un cero afirmaría que no ganamos nada — tan falso como el
-- 100% de margen que se quería evitar.
--
-- Lo que no se verificó es que las columnas aceptaran nulo. `margen_porcentaje`
-- sí; `utilidad_bruta` era NOT NULL. Así que cada venta sin PA Code fallaba al
-- insertarse, y como la ingesta no borra el mensaje de la cola cuando algo
-- falla —para no perder ventas—, el mismo mensaje se reintentó **697 veces en
-- 32 horas**: una sola transacción de Garden Santa Fe, archivada una y otra
-- vez. No eran 697 ventas perdidas, era una atorada.
--
-- Por qué nulo y no cero
-- ----------------------
-- Porque no lo sabemos. Los reportes suman con SUM(), que ignora nulos, así
-- que estas ventas quedan fuera del promedio en vez de ensuciarlo. Es el mismo
-- criterio que ya tenía `margen_porcentaje`.
-- ============================================================================

alter table public.ventas_maquina alter column utilidad_bruta drop not null;

comment on column public.ventas_maquina.utilidad_bruta is
  'Utilidad de la venta. NULL cuando la bebida no se pudo identificar: sin saber qué se despachó no hay costo, y un cero afirmaría que no ganamos nada, que es tan falso como un 100% de margen. Los reportes suman con SUM(), que ignora nulos, así que esas ventas quedan fuera del promedio en vez de ensuciarlo.';
