-- Nuevo movimiento_tipo para devoluciones de vasos. Va en migración separada
-- porque Postgres no permite usar un valor de enum recién creado en la misma
-- transacción.
alter type public.movimiento_tipo add value if not exists 'devolucion_entrada_vaso';
