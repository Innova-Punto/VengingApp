-- ============================================================================
-- 148 · La venta sin PA Code se registra, no se tira (1/2: la marca)
--
-- Cuando Nayax mandaba una transacción con `Product PA Code: null`, la ingesta
-- la archivaba y la venta no existía para la app. En octubre fueron 76
-- transacciones y $3,304 que el cliente sí pagó y que no aparecían en ningún
-- reporte, ni en el cierre, ni en el portal del cliente. Corrió 24 días en
-- silencio y nos enteramos porque Mariana cuadró a mano contra Nayax.
--
-- El dinero es el dato duro: perder el ingreso por no poder nombrar la bebida
-- es peor que registrarla como desconocida, que es justo lo que hace Nayax
-- cuando manda "Unknown". Esta mitad agrega la marca; la lógica va en la 2/2.
-- ============================================================================

alter table public.ventas_maquina
  add column if not exists producto_sin_identificar boolean not null default false;

comment on column public.ventas_maquina.producto_sin_identificar is
  'La venta llegó de Nayax sin PA Code, o con uno que no existe en la máquina. El importe es real; la bebida y el consumo de polvo están sin resolver.';

create index if not exists ventas_maquina_sin_identificar_idx
  on public.ventas_maquina (maquina_id, fecha_transaccion)
  where producto_sin_identificar;
