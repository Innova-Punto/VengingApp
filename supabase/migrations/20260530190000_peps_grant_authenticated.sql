-- Permite a authenticated llamar las funciones PEPS desde server actions
-- sin necesidad del service_role_key. SECURITY DEFINER mantiene los
-- privilegios del owner; el grant solo concede EXECUTE.
grant execute on function public.pick_batch_peps_cartucho(uuid, int) to authenticated;
grant execute on function public.pick_lote_peps_vaso(uuid, int) to authenticated;
grant execute on function public.pick_lote_peps_granel(uuid, int) to authenticated;
