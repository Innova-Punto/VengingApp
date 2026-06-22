-- Enum value en migración separada (postgres no permite usarlo en la misma tx).
alter type public.movimiento_tipo add value if not exists 'venta_intercompany';
