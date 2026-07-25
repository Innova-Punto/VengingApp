-- ============================================================================
-- 95 · Alerta: salidas de surtido duplicadas (red de seguridad)
--
-- Aunque completarSurtido ya es idempotente (claim atómico), esta alerta
-- detecta cualquier surtido_item con más de una salida de cartucho/vaso
-- (posible doble guardado) y lo reporta en `alertas`. Ignora los que ya
-- fueron reintegrados manualmente (ajuste_conteo_almacen '...duplicado...').
-- ============================================================================

create or replace function public.detectar_surtidos_duplicados(p_dias int default 7)
returns int
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_n int;
begin
  with dups as (
    select mi.referencia_id as surtido_item_id, count(*) as veces
      from public.movimientos_inventario mi
     where mi.tipo = 'surtido_salida_cartucho'::movimiento_tipo
       and mi.referencia_tabla = 'surtido_items'
       and mi.fecha >= now() - make_interval(days => p_dias)
     group by mi.referencia_id
    having count(*) > 1
  ),
  ins as (
    insert into public.alertas (tipo, severidad, maquina_id, mensaje, datos_jsonb)
    select 'surtido_salida_duplicada'::alerta_tipo, 'warning'::alerta_severidad, si.maquina_id,
           'Surtido ' || coalesce(su.folio,'?') || ' · ' || coalesce(mq.alias, 'serie '||mq.serie)
             || ': la salida de ' || coalesce(p.nombre,'producto') || ' se registró ' || d.veces
             || ' veces (posible doble guardado). Revisar inventario de almacén.',
           jsonb_build_object('surtido_item_id', d.surtido_item_id, 'surtido_id', su.id,
                              'folio', su.folio, 'veces', d.veces, 'producto_id', si.producto_id)
      from dups d
      join public.surtido_items si on si.id = d.surtido_item_id
      join public.surtidos su on su.id = si.surtido_id
      left join public.maquinas mq on mq.id = si.maquina_id
      left join public.productos p on p.id = si.producto_id
     where not exists (
             select 1 from public.alertas a
              where a.tipo = 'surtido_salida_duplicada'::alerta_tipo
                and (a.datos_jsonb->>'surtido_item_id')::uuid = d.surtido_item_id)
       and not exists (
             select 1 from public.movimientos_inventario aj
              where aj.tipo = 'ajuste_conteo_almacen'::movimiento_tipo
                and aj.referencia_id = d.surtido_item_id
                and aj.notas ilike '%duplicado%')
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end $$;
revoke execute on function public.detectar_surtidos_duplicados(int) from anon, public;

-- Cron: cada hora al minuto 15
select cron.schedule('detectar-surtidos-duplicados', '15 * * * *',
  $$select public.detectar_surtidos_duplicados(7);$$);
