-- ============================================================================
-- 148 · La venta sin PA Code se registra, no se tira
--
-- Qué pasaba
-- ----------
-- Cuando Nayax mandaba una transacción con `Product PA Code: null`, la ingesta
-- la archivaba en `nayax_mensajes_descartados` y la venta no existía para la
-- app. En octubre fueron 76 transacciones y $3,304: dinero cobrado al cliente
-- que no aparecía en ningún reporte, ni en el cierre, ni en el portal del
-- cliente. Corrió 24 días en silencio y nos enteramos porque Mariana cuadró a
-- mano contra Nayax.
--
-- La causa de fondo son productos sin PA Code asignado en el planograma de
-- Nayax. Eso se arregla allá, pero la app no puede depender de que allá esté
-- siempre bien.
--
-- El criterio
-- -----------
-- **El dinero es el dato duro.** Perder el ingreso de los reportes por no
-- poder nombrar la bebida es peor que registrar la bebida como desconocida,
-- que es justo lo que hace Nayax (manda "Unknown"). La venta entra con su
-- importe, su IVA y su comisión, y se marca para que alguien la resuelva.
--
-- Lo que NO hace, a propósito: no descuenta polvo ni vaso. No sabemos qué se
-- despachó, y suponerlo ensuciaría el inventario y el consumo teórico del
-- cierre — que es el número con el que se detectan las máquinas descalibradas.
-- El faltante aparecerá en el siguiente pesaje, y la marca dice por qué.
--
-- `utilidad_bruta` y `margen_porcentaje` quedan en null, no en cero: sin costo,
-- un cero haría que estas ventas se vieran con 100% de margen e inflaría los
-- indicadores. Null las deja fuera del promedio, que es lo honesto.
-- ============================================================================

alter table public.ventas_maquina
  add column if not exists producto_sin_identificar boolean not null default false;

comment on column public.ventas_maquina.producto_sin_identificar is
  'La venta llegó de Nayax sin PA Code, o con uno que no existe en la máquina. El importe es real; la bebida y el consumo de polvo están sin resolver.';

create index if not exists ventas_maquina_sin_identificar_idx
  on public.ventas_maquina (maquina_id, fecha_transaccion)
  where producto_sin_identificar;

-- La firma cambia (entra `p_nombre_nayax`), así que la vieja se dropea antes.
-- Dejar las dos vivas es el error que ya nos costó caro con otras funciones:
-- PostgREST resuelve por parámetros nombrados y puede pegarle a la de antes.
drop function if exists public.procesar_venta_nayax(
  text, text, text, timestamp with time zone, numeric, text, text, uuid, numeric
);

create or replace function public.procesar_venta_nayax(
  p_nayax_transaction_id text,
  p_nayax_machine_id text,
  p_nayax_item_code text,
  p_fecha_transaccion timestamp with time zone,
  p_precio_bruto numeric,
  p_metodo_pago text default null,
  p_ticket_id text default null,
  p_sync_log_id uuid default null,
  p_comision_pct numeric default 0.0394,
  p_nombre_nayax text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_maquina record; v_tolva record; v_maquina_item record;
  v_cliente_id uuid; v_producto_id uuid; v_gramos int := 0;
  v_costo_polvo numeric(14,2) := 0; v_costo_vaso numeric(14,2) := 0;
  v_comision numeric(14,2); v_precio_neto numeric(14,2);
  v_iva numeric(14,2); v_precio_sin_iva numeric(14,2);
  v_utilidad numeric(14,2); v_margen numeric(8,4);
  v_cierre_id uuid; v_venta_id uuid; v_ingr record;
begin
  if p_nayax_transaction_id is null or p_nayax_transaction_id = '' then
    raise exception 'Falta nayax_transaction_id';
  end if;

  select id into v_venta_id from public.ventas_maquina
   where nayax_transaction_id = p_nayax_transaction_id;
  if v_venta_id is not null then return v_venta_id; end if;

  select * into v_maquina from public.maquinas
   where activo = true
     and (nayax_machine_id = p_nayax_machine_id or nayax_serial = p_nayax_machine_id)
   limit 1;
  if v_maquina is null then
    raise exception 'Máquina con nayax_machine_id % no encontrada', p_nayax_machine_id;
  end if;

  select u.cliente_id into v_cliente_id
    from public.ubicaciones u where u.id = v_maquina.ubicacion_id;

  -- El dinero se calcula igual en los tres caminos: es el dato duro.
  v_iva := round(p_precio_bruto * 16.0/116.0, 2);
  v_precio_sin_iva := round(p_precio_bruto / 1.16, 2);
  v_comision := round(p_precio_bruto * p_comision_pct, 2);
  v_precio_neto := round(v_precio_sin_iva - v_comision, 2);

  select id into v_cierre_id from public.cierres_mensuales
   where periodo_mes = extract(month from p_fecha_transaccion)::int
     and periodo_anio = extract(year from p_fecha_transaccion)::int
   limit 1;

  -- ══ Resolver qué se vendió ══
  if v_maquina.tipo = 'preparado' then
    if p_nayax_item_code is not null then
      select * into v_maquina_item from public.maquina_items
       where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code limit 1;
    end if;
  else
    if p_nayax_item_code is not null then
      select * into v_tolva from public.tolvas
       where maquina_id = v_maquina.id and nayax_item_code = p_nayax_item_code limit 1;
    end if;
  end if;

  -- ══ SIN IDENTIFICAR: entra el dinero, no el consumo ══
  if v_maquina_item is null and v_tolva is null then
    insert into public.ventas_maquina (
      nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id,
      fecha_transaccion, gramos_dispensados, precio_bruto, iva, precio_sin_iva,
      comision_nayax_estimada, precio_neto, costo_polvo, costo_vaso,
      utilidad_bruta, margen_porcentaje, metodo_pago, ticket_id_nayax,
      sync_log_id, cierre_id, notas, producto_sin_identificar
    ) values (
      p_nayax_transaction_id, v_maquina.id, null, null, v_cliente_id,
      p_fecha_transaccion, 0, p_precio_bruto, v_iva, v_precio_sin_iva,
      v_comision, v_precio_neto, 0, 0,
      null, null, p_metodo_pago, p_ticket_id,
      p_sync_log_id, v_cierre_id,
      'SIN IDENTIFICAR' ||
        case when p_nombre_nayax is not null and p_nombre_nayax <> 'Unknown'
             then ' · Nayax dice: ' || p_nombre_nayax else '' end ||
        case when p_nayax_item_code is not null
             then ' · PA Code ' || p_nayax_item_code || ' no existe en esta máquina'
             else ' · llegó sin PA Code' end,
      true
    ) returning id into v_venta_id;
    return v_venta_id;
  end if;

  -- ══ Máquina de receta ══
  if v_maquina_item is not null then
    for v_ingr in
      select mi.tolva_id, mi.gramos, t.producto_id as ingrediente_producto_id,
             coalesce(t.costo_promedio_g_actual,0) as costo_g
        from public.maquina_item_ingredientes mi
        join public.tolvas t on t.id = mi.tolva_id
       where mi.maquina_item_id = v_maquina_item.id
    loop
      v_gramos := v_gramos + v_ingr.gramos;
      v_costo_polvo := v_costo_polvo + round(v_ingr.gramos * v_ingr.costo_g, 2);
    end loop;

    if v_maquina.vaso_producto_id is not null then
      select coalesce(sum(l.unidades_disponibles * l.costo_por_gramo)
                      / nullif(sum(l.unidades_disponibles),0), 0)
        into v_costo_vaso
        from public.lotes l
       where l.producto_id = v_maquina.vaso_producto_id
         and l.activo = true and l.unidades_disponibles > 0;
      v_costo_vaso := round(v_costo_vaso, 2);
    end if;

    v_utilidad := round(v_precio_neto - v_costo_polvo - v_costo_vaso, 2);
    v_margen := case when v_precio_neto > 0
                     then round(v_utilidad / v_precio_neto * 100, 2) else null end;

    insert into public.ventas_maquina (
      nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id,
      fecha_transaccion, gramos_dispensados, precio_bruto, iva, precio_sin_iva,
      comision_nayax_estimada, precio_neto, costo_polvo, costo_vaso,
      utilidad_bruta, margen_porcentaje, metodo_pago, ticket_id_nayax,
      sync_log_id, cierre_id, notas
    ) values (
      p_nayax_transaction_id, v_maquina.id, null, null, v_cliente_id,
      p_fecha_transaccion, v_gramos, p_precio_bruto, v_iva, v_precio_sin_iva,
      v_comision, v_precio_neto, v_costo_polvo, v_costo_vaso,
      v_utilidad, v_margen, p_metodo_pago, p_ticket_id,
      p_sync_log_id, v_cierre_id, 'Receta: ' || v_maquina_item.nombre
    ) returning id into v_venta_id;

    for v_ingr in
      select mi.tolva_id, mi.gramos, t.producto_id as ingrediente_producto_id,
             coalesce(t.costo_promedio_g_actual,0) as costo_g
        from public.maquina_item_ingredientes mi
        join public.tolvas t on t.id = mi.tolva_id
       where mi.maquina_item_id = v_maquina_item.id
    loop
      insert into public.venta_ingredientes (venta_id, tolva_id, producto_id, gramos, costo)
      values (v_venta_id, v_ingr.tolva_id, v_ingr.ingrediente_producto_id,
              v_ingr.gramos, round(v_ingr.gramos * v_ingr.costo_g, 2));

      update public.tolvas
         set inventario_actual_g = greatest(0, inventario_actual_g - v_ingr.gramos)
       where id = v_ingr.tolva_id;

      if v_ingr.ingrediente_producto_id is not null then
        insert into public.movimientos_inventario (
          tipo, producto_id, maquina_id, tolva_id, presentacion,
          cantidad_cartuchos, cantidad_vasos, gramos,
          costo_por_gramo_snapshot, valor_movimiento,
          referencia_tabla, referencia_id, usuario_id, fecha
        ) values (
          'venta_salida_tolva'::movimiento_tipo, v_ingr.ingrediente_producto_id,
          v_maquina.id, v_ingr.tolva_id, 'polvo_en_tolva'::mov_presentacion,
          0, 0, -v_ingr.gramos, v_ingr.costo_g,
          -round(v_ingr.gramos * v_ingr.costo_g, 2),
          'ventas_maquina', v_venta_id, null, p_fecha_transaccion
        );
      end if;
    end loop;

    if v_maquina.vaso_producto_id is not null then
      update public.maquinas
         set vaso_inventario_actual = greatest(0, vaso_inventario_actual - 1)
       where id = v_maquina.id;
      insert into public.movimientos_inventario (
        tipo, producto_id, maquina_id, presentacion,
        cantidad_cartuchos, cantidad_vasos, gramos,
        costo_por_gramo_snapshot, valor_movimiento,
        referencia_tabla, referencia_id, usuario_id, fecha
      ) values (
        'venta_salida_tolva'::movimiento_tipo, v_maquina.vaso_producto_id,
        v_maquina.id, 'vaso'::mov_presentacion, 0, -1, 0, 0, -v_costo_vaso,
        'ventas_maquina', v_venta_id, null, p_fecha_transaccion
      );
    end if;

    return v_venta_id;
  end if;

  -- ══ Máquina de polvo directo ══
  v_producto_id := v_tolva.producto_id;
  v_gramos := coalesce(v_tolva.gramaje_servicio, 0);
  if v_gramos <= 0 then
    raise exception 'Tolva % no tiene gramaje_servicio configurado', v_tolva.id;
  end if;
  v_costo_polvo := round(v_gramos * coalesce(v_tolva.costo_promedio_g_actual, 0), 2);

  if v_maquina.vaso_producto_id is not null then
    select coalesce(sum(l.unidades_disponibles * l.costo_por_gramo)
                    / nullif(sum(l.unidades_disponibles),0), 0)
      into v_costo_vaso
      from public.lotes l
     where l.producto_id = v_maquina.vaso_producto_id
       and l.activo = true and l.unidades_disponibles > 0;
    v_costo_vaso := round(v_costo_vaso, 2);
  end if;

  v_utilidad := round(v_precio_neto - v_costo_polvo - v_costo_vaso, 2);
  v_margen := case when v_precio_neto > 0
                   then round(v_utilidad / v_precio_neto * 100, 2) else null end;

  insert into public.ventas_maquina (
    nayax_transaction_id, maquina_id, tolva_id, producto_id, cliente_id,
    fecha_transaccion, gramos_dispensados, precio_bruto, iva, precio_sin_iva,
    comision_nayax_estimada, precio_neto, costo_polvo, costo_vaso,
    utilidad_bruta, margen_porcentaje, metodo_pago, ticket_id_nayax,
    sync_log_id, cierre_id
  ) values (
    p_nayax_transaction_id, v_maquina.id, v_tolva.id, v_producto_id, v_cliente_id,
    p_fecha_transaccion, v_gramos, p_precio_bruto, v_iva, v_precio_sin_iva,
    v_comision, v_precio_neto, v_costo_polvo, v_costo_vaso,
    v_utilidad, v_margen, p_metodo_pago, p_ticket_id, p_sync_log_id, v_cierre_id
  ) returning id into v_venta_id;

  insert into public.venta_ingredientes (venta_id, tolva_id, producto_id, gramos, costo)
  values (v_venta_id, v_tolva.id, v_producto_id, v_gramos, v_costo_polvo);

  update public.tolvas
     set inventario_actual_g = greatest(0, inventario_actual_g - v_gramos)
   where id = v_tolva.id;

  if v_producto_id is not null then
    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id, tolva_id, presentacion,
      cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, fecha
    ) values (
      'venta_salida_tolva'::movimiento_tipo, v_producto_id, v_maquina.id,
      v_tolva.id, 'polvo_en_tolva'::mov_presentacion, 0, 0, -v_gramos,
      coalesce(v_tolva.costo_promedio_g_actual, 0), -v_costo_polvo,
      'ventas_maquina', v_venta_id, null, p_fecha_transaccion
    );
  end if;

  if v_maquina.vaso_producto_id is not null then
    update public.maquinas
       set vaso_inventario_actual = greatest(0, vaso_inventario_actual - 1)
     where id = v_maquina.id;
    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id, presentacion,
      cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, fecha
    ) values (
      'venta_salida_tolva'::movimiento_tipo, v_maquina.vaso_producto_id,
      v_maquina.id, 'vaso'::mov_presentacion, 0, -1, 0, 0, -v_costo_vaso,
      'ventas_maquina', v_venta_id, null, p_fecha_transaccion
    );
  end if;

  return v_venta_id;
end;
$function$;
