-- ============================================================================
-- 152 · Las dos tolvas que quedaron desbordadas por la caja de chocolate
--
-- Continuación de 20261031173400. Aquella corrigió el almacén; ésta corrige lo
-- que alcanzó a salir a campo antes de que nos diéramos cuenta.
--
-- Cuatro llenados jalaron un cartucho de ENC-000204 cuando el sistema creía que
-- ese cartucho pesaba 5,448 g. El operador cargó una bolsa de 908 g —Mariana lo
-- confirmó, y los cuatro llenados registran `cartuchos_cargados = 1`— pero el
-- sistema sumó 5,448 g a la tolva. De ahí los 4,540 g de diferencia, idénticos
-- en los cuatro casos.
--
-- Mixcoac ya se arregló sola: su pesaje del 30-oct midió la tolva y la dejó en
-- 1,087 g. No se toca; un dato medido le gana a cualquier aritmética nuestra.
--
-- Las otras dos:
--
--   TLATELOLCO T4 · El pesaje del 30-oct la dejó en 22 g y 35 segundos después
--        el llenado le sumó 5,448. Como el punto de partida es un pesaje
--        físico, el número correcto es aritmética sobre un dato medido:
--        22 + 908 = 930, menos 48 g de dos ventas del 31-oct = 882 g.
--
--   CENTER PLAZAS T4 · Su último pesaje es del 1-oct, así que aquí el punto de
--        partida es el inventario teórico del llenado del 19-oct (463 g) más la
--        bolsa: 463 + 908 = 1,371, menos 612 g de ventas desde entonces = 759 g.
--        **Esto es teórico, no medido** (CLAUDE.md §4.4): no se puede auditar
--        sin pesaje. Se corrige de todos modos porque 5,299 g en una tolva de
--        1,500 es un número físicamente imposible, y mientras esté ahí la
--        máquina se ve llena, no entra a la sugerencia de resurtido y se vacía
--        sin que nadie se entere. El pesaje de Diego manda cuando ocurra.
--
-- El costo promedio por gramo de las tres tolvas quedó en ~0.1400 y no cambia:
-- todo el chocolate salió de los mismos encartuchados. Lo que estaba mal era la
-- cantidad, no el costo.
--
-- Impacto: −9,080 g de chocolate que nunca estuvieron en esas tolvas,
-- $1,272.08 sin IVA.
-- ============================================================================

do $$
declare
  v_dir  constant uuid := 'b16c8e99-9dba-4694-82cb-a125491e7d9a'; -- dirección
  v_prod uuid;
  v_t    record;
begin
  select id into v_prod from public.productos where sku = 'PF-CHOCOLATE-004';
  if v_prod is null then
    raise notice 'PF-CHOCOLATE-004 no existe en esta base; nada que corregir.';
    return;
  end if;

  for v_t in
    select t.id, t.inventario_actual_g, t.costo_promedio_g_actual,
           d.destino, d.motivo, mq.alias
      from (values
        ('5ea353e2-f1c7-4281-ab32-9916f3342667'::uuid, 882,
         'Corrección de la caja de chocolate: el llenado del 30-oct cargó 1 bolsa de 908 g, no 5,448. Sobre el pesaje de ese día (22 g): 22 + 908 − 48 de ventas = 882 g.'),
        ('2ab7561b-8825-422e-a46f-7cccb56a038b'::uuid, 759,
         'Corrección de la caja de chocolate: el llenado del 19-oct cargó 1 bolsa de 908 g, no 5,448. Sobre el teórico de ese día (463 g): 463 + 908 − 612 de ventas = 759 g. Cifra teórica — sujeta al próximo pesaje físico.')
      ) as d(tolva_id, destino, motivo)
      join public.tolvas t on t.id = d.tolva_id
      join public.maquinas mq on mq.id = t.maquina_id
     where t.producto_id = v_prod
       and t.inventario_actual_g <> d.destino
  loop
    insert into public.movimientos_inventario (
      tipo, producto_id, tolva_id, maquina_id, presentacion,
      gramos, costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, notas
    )
    select 'ajuste_manual', v_prod, v_t.id, t.maquina_id, 'polvo_en_tolva',
           v_t.destino - v_t.inventario_actual_g,
           v_t.costo_promedio_g_actual,
           round((v_t.destino - v_t.inventario_actual_g) * v_t.costo_promedio_g_actual, 2),
           'tolvas', v_t.id, v_dir, v_t.motivo
      from public.tolvas t where t.id = v_t.id;

    update public.tolvas
       set inventario_actual_g = v_t.destino
     where id = v_t.id;

    insert into public.audit_log (tabla, registro_id, accion, user_id, diff_jsonb)
    values (
      'tolvas', v_t.id, 'update', v_dir,
      jsonb_build_object(
        'motivo', 'Corrección de la caja de chocolate (migración 20261031173400)',
        'maquina', v_t.alias,
        'antes_g', v_t.inventario_actual_g,
        'despues_g', v_t.destino
      )
    );
  end loop;
end $$;
