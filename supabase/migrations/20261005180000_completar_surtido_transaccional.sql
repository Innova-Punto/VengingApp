-- ============================================================================
-- 143 · completar_surtido: una sola transacción
--
-- Qué estaba mal
-- --------------
-- `completarSurtido` (Server Action) hacía esto, cada paso en su propia
-- llamada a PostgREST y por lo tanto en su propia transacción:
--
--   1. validar stock item por item
--   2. CLAIM: marcar el surtido como 'completado'   <-- commit
--   3. para cada item: PEPS, descontar contador, insertar kardex
--
-- Dos agujeros:
--
--   (a) La validación del paso 1 revisaba cada item contra el stock TOTAL del
--       producto, no contra lo que el propio surtido ya se había comido. Un
--       surtido con dos items de 1 cartucho del mismo SKU pasaba la validación
--       teniendo 1 solo cartucho en almacén.
--   (b) Cuando el PEPS del paso 3 reventaba a media lista, el `redirect()` del
--       catch abortaba el bucle. Pero el surtido YA estaba marcado completado
--       (commit del paso 2) y los items anteriores YA estaban descontados
--       (commits propios). Resultado: surtido completado con descuento parcial.
--       Y al reintentar, el claim devolvía 0 filas y la acción salía en
--       silencio sin descontar nada.
--
-- Pasó el 1-oct-2026 con SUR-000387: dos items de FTC-011 con un solo cartucho
-- en almacén (ENC-000323, con 16 más, se encartuchó 46 segundos después de que
-- el surtido se completó). Reventó en el item 9 de 24; 11 items se quedaron sin
-- descontar: 8 cartuchos y 150 vasos que salieron del almacén y nunca bajaron
-- del inventario.
--
-- Qué hace esta migración
-- -----------------------
-- Mueve todo a un RPC `security definer`. Una sola transacción: si el PEPS
-- revienta, se revierte TODO — incluido el sello de 'completado'. El surtido se
-- queda pendiente, Mariana ve el error, encartucha lo que falta y vuelve a
-- darle. La validación previa se agrega POR PRODUCTO sobre todo el surtido y
-- reporta todos los faltantes de un jalón, no solo el primero.
--
-- El bloqueo de fila (FOR UPDATE) cubre el doble clic que antes cubría el
-- claim: la segunda llamada espera, ve 'completado' y sale sin descontar.
-- ============================================================================

create or replace function public.completar_surtido(p_surtido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid            uuid := auth.uid();
  v_estado         surtido_estado;
  v_asignacion_id  uuid;
  v_folio          text;
  v_faltantes      text[] := '{}';
  v_cart_total     int := 0;
  v_vasos_total    int := 0;
  r                record;
  p                record;
  v_enc            record;
  v_lote           record;
  v_gramos         int;
  v_valor          numeric(14,2);
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if not (user_has_role('admin'::app_role)
       or user_has_role('direccion'::app_role)
       or user_has_role('planeador'::app_role)
       or user_has_role('almacen'::app_role)) then
    raise exception 'Solo admin, dirección, planeador o almacén pueden completar surtidos.';
  end if;

  -- Bloqueo de fila: serializa doble clic y reintentos concurrentes.
  select estado, asignacion_id, folio
    into v_estado, v_asignacion_id, v_folio
    from public.surtidos
   where id = p_surtido_id
     for update;

  if v_estado is null then
    raise exception 'Surtido no encontrado';
  end if;
  if v_estado = 'completado'::surtido_estado then
    -- Ya lo completó otra ejecución. No re-descontar.
    return jsonb_build_object('ok', true, 'ya_completado', true, 'folio', v_folio);
  end if;

  -- -- Paso 1: validación agregada POR PRODUCTO sobre todo el surtido.
  -- Aquí está el fix de (a): sumamos lo que pide el surtido entero de cada SKU
  -- y lo comparamos contra el disponible una sola vez.
  for r in
    select si.producto_id,
           pr.sku, pr.nombre, pr.tipo,
           sum(coalesce(si.cartuchos_entregados, 0))::int as cartuchos,
           sum(coalesce(si.vasos_entregados, 0))::int     as vasos
      from public.surtido_items si
      join public.productos pr on pr.id = si.producto_id
     where si.surtido_id = p_surtido_id
     group by si.producto_id, pr.sku, pr.nombre, pr.tipo
    having sum(coalesce(si.cartuchos_entregados, 0)) > 0
        or sum(coalesce(si.vasos_entregados, 0)) > 0
  loop
    if r.tipo = 'polvo'::producto_tipo and r.cartuchos > 0 then
      if coalesce((select sum(e.cantidad_disponible)
                     from public.encartuchados e
                    where e.producto_id = r.producto_id), 0) < r.cartuchos then
        v_faltantes := v_faltantes || format(
          '%s: el surtido pide %s cartucho(s), solo hay %s',
          coalesce(r.sku, r.nombre), r.cartuchos,
          coalesce((select sum(e.cantidad_disponible)
                      from public.encartuchados e
                     where e.producto_id = r.producto_id), 0));
      end if;
    end if;

    if r.tipo = 'vaso'::producto_tipo and r.vasos > 0 then
      if coalesce((select sum(l.unidades_disponibles)
                     from public.lotes l
                    where l.producto_id = r.producto_id
                      and l.activo), 0) < r.vasos then
        v_faltantes := v_faltantes || format(
          '%s: el surtido pide %s vaso(s), solo hay %s',
          coalesce(r.sku, r.nombre), r.vasos,
          coalesce((select sum(l.unidades_disponibles)
                      from public.lotes l
                     where l.producto_id = r.producto_id
                       and l.activo), 0));
      end if;
    end if;
  end loop;

  if array_length(v_faltantes, 1) > 0 then
    raise exception 'Stock insuficiente — %', array_to_string(v_faltantes, ' | ');
  end if;

  -- -- Paso 2: PEPS, descuento de contadores y kardex, item por item.
  -- Todo dentro de esta misma transacción: si algo revienta aquí abajo, no
  -- queda ni el descuento a medias ni el sello de completado.
  for p in
    select si.id, si.maquina_id, si.producto_id,
           coalesce(si.cartuchos_entregados, 0) as cartuchos,
           coalesce(si.vasos_entregados, 0)     as vasos,
           pr.tipo
      from public.surtido_items si
      join public.productos pr on pr.id = si.producto_id
     where si.surtido_id = p_surtido_id
     order by si.created_at, si.id
  loop
    if p.tipo = 'polvo'::producto_tipo and p.cartuchos > 0 then
      for v_enc in
        select * from public.pick_batch_peps_cartucho(p.producto_id, p.cartuchos)
      loop
        update public.encartuchados
           set cantidad_disponible = cantidad_disponible - v_enc.cantidad_tomar
         where id = v_enc.encartuchado_id
         returning gramos_por_cartucho into v_gramos;

        v_gramos := v_enc.cantidad_tomar * v_gramos;
        v_valor  := round(v_gramos * v_enc.costo_promedio_g, 2);

        -- El primer lote PEPS queda como el "principal" del item, igual que antes.
        update public.surtido_items
           set encartuchado_id = coalesce(encartuchado_id, v_enc.encartuchado_id)
         where id = p.id;

        insert into public.movimientos_inventario (
          tipo, producto_id, encartuchado_id, maquina_id, presentacion,
          cantidad_cartuchos, gramos, costo_por_gramo_snapshot, valor_movimiento,
          referencia_tabla, referencia_id, usuario_id
        ) values (
          'surtido_salida_cartucho'::movimiento_tipo, p.producto_id,
          v_enc.encartuchado_id, p.maquina_id, 'cartucho'::mov_presentacion,
          -v_enc.cantidad_tomar, -v_gramos, v_enc.costo_promedio_g, -v_valor,
          'surtido_items', p.id, v_uid
        );

        v_cart_total := v_cart_total + v_enc.cantidad_tomar;
      end loop;
    end if;

    if p.tipo = 'vaso'::producto_tipo and p.vasos > 0 then
      for v_lote in
        select * from public.pick_lote_peps_vaso(p.producto_id, p.vasos)
      loop
        update public.lotes
           set unidades_disponibles = coalesce(unidades_disponibles, 0) - v_lote.cantidad_tomar
         where id = v_lote.lote_id;

        v_valor := round(v_lote.cantidad_tomar * v_lote.costo_por_unidad, 2);

        update public.surtido_items
           set lote_vaso_id = coalesce(lote_vaso_id, v_lote.lote_id)
         where id = p.id;

        insert into public.movimientos_inventario (
          tipo, producto_id, lote_id, maquina_id, presentacion,
          cantidad_vasos, costo_por_gramo_snapshot, valor_movimiento,
          referencia_tabla, referencia_id, usuario_id
        ) values (
          'surtido_salida_cartucho'::movimiento_tipo, p.producto_id,
          v_lote.lote_id, p.maquina_id, 'vaso'::mov_presentacion,
          -v_lote.cantidad_tomar, v_lote.costo_por_unidad, -v_valor,
          'surtido_items', p.id, v_uid
        );

        v_vasos_total := v_vasos_total + v_lote.cantidad_tomar;
      end loop;
    end if;
  end loop;

  -- -- Paso 3: sellar. Hasta aquí llegó todo bien, así que ahora sí.
  update public.surtidos
     set estado           = 'completado'::surtido_estado,
         surtido_por      = v_uid,
         fecha_completado = now()
   where id = p_surtido_id;

  -- La jornada pasa a 'surtida', pero nunca retrocede si ya arrancó.
  update public.asignaciones_diarias
     set estado = 'surtida'::asignacion_estado
   where id = v_asignacion_id
     and estado in ('planeada'::asignacion_estado, 'surtida'::asignacion_estado);

  return jsonb_build_object(
    'ok', true,
    'ya_completado', false,
    'folio', v_folio,
    'cartuchos', v_cart_total,
    'vasos', v_vasos_total
  );
end;
$$;

revoke all on function public.completar_surtido(uuid) from public;
grant execute on function public.completar_surtido(uuid) to authenticated;

comment on function public.completar_surtido(uuid) is
  'Completa un surtido en UNA transacción: valida stock agregado por producto, '
  'aplica PEPS, descuenta contadores, registra kardex y sella el surtido. Si algo '
  'falla, no queda nada a medias.';

-- Las funciones PEPS se llaman ahora desde dentro de completar_surtido (que es
-- security definer y corre como owner), así que siguen sin estar expuestas.
