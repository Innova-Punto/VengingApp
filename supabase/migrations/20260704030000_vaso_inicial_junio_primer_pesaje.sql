-- ============================================================================
-- 85 · Junio (bootstrap): inicial de vasos EN MÁQUINA = primer pesaje
--
-- El inicial de vasos de junio estaba en 0. No se reconstruye por kardex: se
-- toma el CONTEO de vasos del PRIMER pesaje de cada máquina (vasos_medidos),
-- que es el inventario de vasos que había en la máquina al activarla, igual
-- criterio que el polvo. Valuado al costo unitario de vaso vigente.
--
-- (Almacén de vasos inicial de junio se deja como está — no hubo conteo al
-- arranque; de julio en adelante el inicial = final de junio, encadenado.)
-- ============================================================================

update public.cierre_snapshot_producto csp
   set maq_vasos_unidades = sub.u,
       maq_vasos_valor = round(sub.u * sub.cu, 2)
  from (
    with primer as (
      select distinct on (maquina_id) id, maquina_id
      from public.pesajes_maquina order by maquina_id, fecha asc
    ),
    maqv as (
      select m.vaso_producto_id as producto_id, coalesce(sum(pm.vasos_medidos),0)::int as u
      from primer
      join public.pesajes_maquina pm on pm.id = primer.id
      join public.maquinas m on m.id = pm.maquina_id
      where m.vaso_producto_id is not null
      group by m.vaso_producto_id
    ),
    costo as (
      select producto_id, sum(unidades_disponibles*costo_por_gramo)/nullif(sum(unidades_disponibles),0) as cu
      from public.lotes where activo and unidades_disponibles is not null group by producto_id
    )
    select maqv.producto_id, maqv.u, coalesce(costo.cu,0) as cu
    from maqv left join costo on costo.producto_id = maqv.producto_id
  ) sub
 where csp.cierre_id = (select id from public.cierres_mensuales where periodo_mes=6 and periodo_anio=2026)
   and csp.momento = 'inicio'
   and csp.producto_id = sub.producto_id;
