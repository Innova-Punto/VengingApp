-- ============================================================================
-- 153 · El llenado deja de aceptar lo que no cabe en la tolva
--
-- Hasta hoy nada en todo el camino del polvo miraba `capacidad_max_g`. Ni el
-- formulario de campo, ni `op_registrar_llenado`, ni `completar_surtido`. Por
-- eso un cartucho mal capturado de 5,448 g entró tres veces a tolvas de 1,500
-- sin una sola queja del sistema. Había un check de inventario negativo —"bug
-- del sistema, revisar inmediatamente"— y ninguno del lado de arriba:
-- cuidábamos el piso y nunca el techo.
--
-- Va como trigger y no dentro del RPC a propósito. `op_registrar_llenado` son
-- 8.5 KB que ya nos mordieron una vez con el asunto de los overloads
-- (CLAUDE.md §4.1); reescribirlo completo para colar tres líneas es más riesgo
-- que valor. Un trigger BEFORE INSERT sobre `llenado_items` ve exactamente el
-- mismo dato —el RPC ya calculó `inventario_tolva_despues`— y es justo el tipo
-- de validación simple que §8.4 permite en trigger.
--
-- El umbral es 200%, no 100%, y la diferencia importa:
--
--   · Pasarse un poco es normal. Hoy hay 49 tolvas arriba de su capacidad y el
--     exceso más grande son 347 g: cartuchos de 400 g entrando a tolvas casi
--     llenas, más el redondeo de un gramaje que nadie pesa bolsa por bolsa.
--     Bloquear al 100% sería frenar a un operador en el gimnasio por algo que
--     no es un error.
--   · Pasarse al doble no es normal nunca. Es un error de datos —un gramaje
--     mal capturado, una presentación con las unidades cambiadas— y ahí sí el
--     operador no debe vaciar la bolsa, porque cada llenado así cuesta un
--     pesaje físico y una corrección manual para volver a saber qué hay dentro.
--
-- Con este umbral los tres llenados de chocolate (393%, 394%, 399%) se habrían
-- detenido el 10 de octubre, y las 49 tolvas de hoy no se enteran.
-- ============================================================================

create or replace function public.check_llenado_no_desborda()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cap int;
  v_tolva int;
  v_alias text;
  v_sku text;
begin
  select coalesce(t.capacidad_max_g_override, t.capacidad_max_g),
         t.numero, m.alias, p.sku
    into v_cap, v_tolva, v_alias, v_sku
    from public.tolvas t
    join public.maquinas m on m.id = t.maquina_id
    left join public.productos p on p.id = t.producto_id
   where t.id = new.tolva_id;

  -- Sin capacidad configurada no hay contra qué comparar. No se inventa un
  -- default: un número supuesto bloquearía llenados buenos y dejaría pasar
  -- malos. La tolva sin capacidad es un hueco de catálogo, no de este trigger.
  if v_cap is null or v_cap <= 0 then
    return new;
  end if;

  if new.inventario_tolva_despues > v_cap * 2 then
    raise exception
      'No cargues este cartucho de %: en la tolva % de % caben % g y con esta carga quedarían % g, más del doble. Casi siempre es un gramaje mal capturado en almacén, no un problema de la máquina. Levanta una incidencia y sigue con el resto de la visita; planeación lo revisa.',
      coalesce(v_sku, 'este producto'),
      v_tolva, coalesce(v_alias, 'esta máquina'), v_cap,
      new.inventario_tolva_despues
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.check_llenado_no_desborda() is
  'Frena un llenado que dejaría la tolva arriba del 200% de su capacidad. Ver migración 20261031190000.';

drop trigger if exists trg_llenado_no_desborda on public.llenado_items;
create trigger trg_llenado_no_desborda
  before insert on public.llenado_items
  for each row execute function public.check_llenado_no_desborda();
