-- ============================================================================
-- El agente de ruteo puede leer el estado del parque.
--
-- `sugerencia_ruteo_diaria` empieza con `if auth.uid() is null then raise
-- 'No autenticado'`. El agente corre **sin sesión de usuario** —con la llave de
-- servicio, igual que los crons—, así que la función le reventaba en la cara.
--
-- Y el resultado fue peor que un error: el código de la app se tragaba el fallo
-- y le entregaba al modelo un catálogo vacío. El agente contestó, con toda
-- razón, que no había máquinas a las que mandar a nadie. Parecía un parque
-- vacío; era una consulta rota. (Eso ya se corrigió también del lado de la app:
-- ahora truena y dice por qué.)
--
-- Aquí se le abre la puerta **solo al agente**: si no hay usuario pero quien
-- llama es `service_role`, pasa. Para cualquier persona la comprobación queda
-- exactamente igual, incluida la de rol — admin, dirección o planeación.
--
-- Se parchea sobre la definición viva en vez de reescribir la función entera:
-- son 26 columnas y un cuerpo largo, y reescribirlo a mano es la mejor forma
-- de introducir una diferencia sin querer.
-- ============================================================================

do $do$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sugerencia_ruteo_diaria';

  if def is null then
    raise exception 'No existe public.sugerencia_ruteo_diaria()';
  end if;

  def := replace(def,
    'if auth.uid() is null then
    raise exception ''No autenticado'';',
    'if auth.uid() is null and coalesce(auth.role(), '''') <> ''service_role'' then
    raise exception ''No autenticado'';');

  def := replace(def,
    'if not (user_has_role(''admin''::app_role)',
    'if auth.uid() is not null and not (user_has_role(''admin''::app_role)');

  -- Si los textos no coincidieron, la función se quedaría igual y el agente
  -- seguiría sin poder leer. Mejor fallar aquí que en la próxima corrida.
  if def not like '%service_role%' then
    raise exception 'No se pudo parchear la comprobación de acceso: el cuerpo de la función cambió.';
  end if;

  execute def;
end $do$;

comment on function public.sugerencia_ruteo_diaria is
  'Estado del parque para ruteo. La consultan planeacion, direccion y admin desde la app, y el agente de ruteo con la llave de servicio (sin sesion de usuario).';
