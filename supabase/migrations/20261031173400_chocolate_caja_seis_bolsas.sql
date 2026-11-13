-- ============================================================================
-- 151 · La caja de chocolate son 6 bolsas de 908 g, no un cartucho de 5,448 g
--
-- Qué pasó
-- --------
-- La presentación "1 Caja con 6 bolsas (2lb/bolsa)" de PF-CHOCOLATE-004 quedó
-- capturada con `unidades_por_presentacion = 1`. El código de recepción hace
-- bien su trabajo —parte el peso neto entre las unidades para sacar el gramaje
-- del cartucho— pero con un 1 ahí la cuenta da 5,448 g por cartucho. Resultado:
-- tres encartuchados automáticos de 1 cartucho de 5,448 g donde la realidad
-- física siempre fueron 6 bolsas de 908 g.
--
-- El daño se multiplicó en los conteos de almacén. Almacén contó las bolsas
-- (6) contra lo que decía el sistema (1 cartucho) y ajustó +5 **a 5,448 g cada
-- uno**: 27,240 g de chocolate que nunca existieron, dos veces. El conteo no se
-- equivocó; comparó peras con cajas de peras.
--
-- Lo que esta migración corrige, y lo que no
-- ------------------------------------------
--   SÍ · El catálogo (1 → 6 unidades), que es la causa raíz y lo que haría que
--        la siguiente recepción de chocolate repitiera todo.
--   SÍ · Los tres encartuchados: 6 cartuchos de 908 g cada uno.
--   SÍ · El kardex de almacén, con asientos compensatorios (append-only: nada
--        se edita ni se borra, se compensa).
--   NO · Las tolvas. Los cuatro llenados que salieron de ENC-000204 metieron
--        5,448 g donde físicamente entraron 908. Mixcoac ya se corrigió sola
--        con su pesaje del 30-oct; Tlatelolco y Center Plazas se corrigen con
--        el siguiente pesaje físico, que es la única fuente auditable de lo que
--        de verdad hay adentro (CLAUDE.md §4.4). Meterles mano aquí sería
--        adivinar y además chocaría con el ajuste del pesaje.
--   NO · Los renglones de conteo. El conteo físico fue correcto; lo que estaba
--        mal era la unidad contra la que se comparó. Se deja el histórico y se
--        explica en la nota del asiento.
--
-- Impacto
-- -------
-- Se da de baja inventario fantasma por 31,780 g de chocolate = $4,334.02 sin
-- IVA. No es merma ni robo: es polvo que nunca entró al almacén. El dinero de
-- las compras siempre estuvo bien (el costo por gramo no cambia); lo que estaba
-- inflado era el gramaje en existencia.
--
-- Idempotente y segura en base limpia: todo cuelga de un `where folio = ...`
-- que en una base sin datos no encuentra nada y no hace nada.
-- ============================================================================

do $$
declare
  v_dir   constant uuid := 'b16c8e99-9dba-4694-82cb-a125491e7d9a'; -- dirección
  v_prod  uuid;
  v_enc   record;
begin
  select id into v_prod from public.productos where sku = 'PF-CHOCOLATE-004';
  if v_prod is null then
    raise notice 'PF-CHOCOLATE-004 no existe en esta base; nada que corregir.';
    return;
  end if;

  -- ── 1 · La causa raíz: la caja trae 6 bolsas ──────────────────────────────
  update public.presentaciones_proveedor
     set unidades_por_presentacion = 6
   where producto_id = v_prod
     and nombre_presentacion = '1 Caja con 6 bolsas (2lb/bolsa)'
     and unidades_por_presentacion <> 6;

  -- ── 2 · Los tres encartuchados y sus asientos compensatorios ──────────────
  --
  -- Las cantidades no se calculan al vuelo: se escriben una por una porque cada
  -- caso llegó a su estado por un camino distinto, y un `update` genérico
  -- escondería justo la parte que hay que poder auditar.
  --
  --   ENC-000204 (30-jul) · 6 producidos, 6 surtidos, 1 devuelto → 1 en almacén.
  --        Cartuchos: ya cuadra en 1. Gramos: el kardex trae 5,448 y debe traer
  --        908 (un cartucho, uno de verdad). Delta −4,540 g.
  --   ENC-000284 (7-sep) · nunca se surtió, los 6 siguen en almacén.
  --        Cartuchos: ya cuadra en 6. Gramos: 32,688 → 5,448. Delta −27,240 g.
  --   ENC-000357 (14-oct) · no alcanzó a tener conteo, así que los gramos
  --        quedaron bien (5,448) y lo único mal es el reparto: 1 → 6 cartuchos.
  --        Delta +5 cartuchos, 0 g.
  --
  -- El tipo del asiento no es cosmético: los dos primeros nacen de conteos de
  -- agosto y septiembre, que ya están cerrados, y por eso van como
  -- `ajuste_periodo_anterior`. El tercero nació el 14-oct, con octubre abierto,
  -- y además no mueve un solo gramo: solo reparte los que ya estaban.
  for v_enc in
    select e.id, e.folio, e.costo_promedio_g,
           d.tipo::public.movimiento_tipo as tipo,
           d.d_cart, d.d_gram, d.disponible, d.motivo
      from (values
        ('ENC-000204', 'ajuste_periodo_anterior',  0,  -4540, 1,
         'Reparto real de la caja: 6 bolsas de 908 g. Se da de baja el gramaje fantasma que dejó el conteo del 1-ago, que comparó 6 bolsas contra 1 cartucho de 5,448 g.'),
        ('ENC-000284', 'ajuste_periodo_anterior',  0, -27240, 6,
         'Reparto real de la caja: 6 bolsas de 908 g. Se da de baja el gramaje fantasma que dejó el conteo del 30-sep, que comparó 6 bolsas contra 1 cartucho de 5,448 g.'),
        ('ENC-000357', 'ajuste_manual',            5,      0, 6,
         'Reparto real de la caja: 6 bolsas de 908 g. Los gramos ya estaban bien (5,448); lo que faltaba era partirlos en los 6 cartuchos que físicamente son.')
      ) as d(folio, tipo, d_cart, d_gram, disponible, motivo)
      join public.encartuchados e on e.folio = d.folio
     where e.producto_id = v_prod
       and e.gramos_por_cartucho = 5448
  loop
    update public.encartuchados
       set cartuchos_producidos = 6,
           gramos_por_cartucho  = 908,
           cantidad_disponible  = v_enc.disponible,
           notas = coalesce(notas, '') ||
                   ' · Corregido 31-oct-2026: la caja son 6 bolsas de 908 g.'
     where id = v_enc.id;

    if v_enc.d_cart <> 0 or v_enc.d_gram <> 0 then
      insert into public.movimientos_inventario (
        tipo, producto_id, encartuchado_id, presentacion,
        gramos, cantidad_cartuchos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, notas
      ) values (
        v_enc.tipo, v_prod, v_enc.id, 'cartucho',
        v_enc.d_gram, v_enc.d_cart,
        v_enc.costo_promedio_g,
        round(v_enc.d_gram * v_enc.costo_promedio_g, 2),
        'encartuchados', v_enc.id, v_dir,
        v_enc.motivo
      );
    end if;

    insert into public.audit_log (tabla, registro_id, accion, user_id, diff_jsonb)
    values (
      'encartuchados', v_enc.id, 'update', v_dir,
      jsonb_build_object(
        'motivo', 'Corrección de unidades: presentación con unidades_por_presentacion=1',
        'antes',  jsonb_build_object('cartuchos_producidos', 1, 'gramos_por_cartucho', 5448),
        'despues', jsonb_build_object('cartuchos_producidos', 6, 'gramos_por_cartucho', 908),
        'kardex',  jsonb_build_object('delta_cartuchos', v_enc.d_cart, 'delta_gramos', v_enc.d_gram)
      )
    );
  end loop;
end $$;
