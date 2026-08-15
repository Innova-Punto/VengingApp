-- ============================================================================
-- Sustituciones: el surtido debe llevar el producto ENTRANTE
--
-- La versión anterior de crear_sustitucion_tolva solo retiraba del surtido el
-- renglón del producto saliente. Faltaba la otra mitad: si el surtido ya está
-- hecho, el operador llegaría sin cartuchos del sabor nuevo y la tolva se
-- quedaría vacía toda la semana.
--
-- Ahora, además de retirar el saliente, se carga el entrante para la tolva
-- COMPLETA (el operador la vacía antes de llenarla). Si el surtido todavía no
-- existe, no hay nada que corregir: generarSurtido ya lee las sustituciones
-- pendientes y sugiere el entrante desde el principio.
-- ============================================================================

create or replace function public.crear_sustitucion_tolva(
  p_tolva_id uuid,
  p_producto_entrante_id uuid,
  p_motivo text default null,
  p_gramaje_servicio int default null,
  p_nayax_item_code text default null,
  p_precio_venta numeric default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tolva record;
  v_prod_entrante record;
  v_id uuid;
  v_otras_tolvas int;
  v_cartuchos int;
  v_capacidad int;
  v_surtido_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)
       or user_has_role('planeador'::app_role)) then
    raise exception 'Solo admin, dirección o planeación pueden programar sustituciones.';
  end if;

  select t.*, m.id as m_id into v_tolva
    from public.tolvas t join public.maquinas m on m.id = t.maquina_id
   where t.id = p_tolva_id;
  if v_tolva is null then raise exception 'Tolva no encontrada'; end if;
  if v_tolva.producto_id is null then
    raise exception 'La tolva no tiene producto asignado; configúrala en el planograma.';
  end if;
  if v_tolva.producto_id = p_producto_entrante_id then
    raise exception 'El producto entrante es el mismo que ya tiene la tolva.';
  end if;

  select * into v_prod_entrante from public.productos where id = p_producto_entrante_id;
  if v_prod_entrante is null then raise exception 'Producto entrante no encontrado'; end if;
  if v_prod_entrante.tipo <> 'polvo' then
    raise exception 'El producto entrante debe ser de tipo polvo.';
  end if;
  if not v_prod_entrante.activo then
    raise exception 'El producto entrante está inactivo.';
  end if;

  insert into public.sustituciones_tolva (
    tolva_id, maquina_id, producto_saliente_id, producto_entrante_id,
    gramaje_servicio_entrante, nayax_item_code_entrante, precio_venta_entrante,
    motivo, creado_por
  ) values (
    p_tolva_id, v_tolva.m_id, v_tolva.producto_id, p_producto_entrante_id,
    coalesce(p_gramaje_servicio, v_prod_entrante.gramaje_servicio_default, v_tolva.gramaje_servicio),
    coalesce(p_nayax_item_code, v_tolva.nayax_item_code),
    coalesce(p_precio_venta, v_prod_entrante.precio_venta_default, v_tolva.precio_venta),
    p_motivo, v_uid
  ) returning id into v_id;

  -- ── 1. Retirar del surtido el producto SALIENTE ───────────────────────────
  -- El surtido pudo generarse antes de que planeación decidiera el cambio, así
  -- que trae cartuchos de lo que va a salir. Solo se quita si a la máquina no
  -- le queda otra tolva con ese producto (puede tener el mismo polvo en dos
  -- tolvas y sustituir solo una), y solo en surtidos NO completados: los
  -- completados ya descontaron inventario y tocarlos rompería el kardex.
  select count(*) into v_otras_tolvas
    from public.tolvas t
   where t.maquina_id = v_tolva.m_id
     and t.producto_id = v_tolva.producto_id
     and t.id <> p_tolva_id
     and not exists (
       select 1 from public.sustituciones_tolva s
        where s.tolva_id = t.id and s.estado = 'pendiente'
     );

  if v_otras_tolvas = 0 then
    delete from public.surtido_items si
     using public.surtidos s
     where si.surtido_id = s.id
       and si.maquina_id = v_tolva.m_id
       and si.producto_id = v_tolva.producto_id
       and s.estado in ('pendiente'::surtido_estado, 'en_proceso'::surtido_estado);
  end if;

  -- ── 2. Cargar el producto ENTRANTE ────────────────────────────────────────
  -- Tolva completa: el operador la vacía antes de cargarla. floor() para no
  -- mandar un cartucho que no cabe entero (mismo criterio que generarSurtido).
  --
  -- Ojo con la capacidad: el trigger tolva_recalc_capacidad la deriva del
  -- producto, así que al ejecutarse la sustitución la tolva pasará a la
  -- capacidad del ENTRANTE, no la que tiene hoy. Se replica esa fórmula
  -- (override → capacidad del producto → 1200) para no surtir de menos cuando
  -- los dos sabores caben distinto.
  v_capacidad := coalesce(
    v_tolva.capacidad_max_g_override,
    v_prod_entrante.capacidad_g_por_tolva,
    1200
  );

  v_cartuchos := floor(
    v_capacidad::numeric
    / greatest(coalesce(v_prod_entrante.gramaje_cartucho_default, 400), 1)
  );

  if v_cartuchos > 0 then
    for v_surtido_id in
      select s.id
        from public.surtidos s
        join public.asignacion_maquinas am on am.asignacion_id = s.asignacion_id
       where am.maquina_id = v_tolva.m_id
         and s.estado in ('pendiente'::surtido_estado, 'en_proceso'::surtido_estado)
    loop
      -- Si la máquina ya lleva ese producto en el surtido (otra tolva con el
      -- mismo sabor entrante), se suma al renglón en vez de duplicarlo.
      update public.surtido_items
         set cartuchos_sugeridos  = cartuchos_sugeridos + v_cartuchos,
             cartuchos_entregados = cartuchos_entregados + v_cartuchos
       where surtido_id = v_surtido_id
         and maquina_id = v_tolva.m_id
         and producto_id = p_producto_entrante_id;

      if not found then
        insert into public.surtido_items (
          surtido_id, maquina_id, producto_id,
          cartuchos_sugeridos, cartuchos_entregados, notas
        ) values (
          v_surtido_id, v_tolva.m_id, p_producto_entrante_id,
          v_cartuchos, v_cartuchos,
          'Alta automática por sustitución de producto en tolva #' || v_tolva.numero
        );
      end if;
    end loop;
  end if;

  return v_id;
exception when unique_violation then
  raise exception 'Esa tolva ya tiene una sustitución pendiente.';
end;
$$;

revoke all on function public.crear_sustitucion_tolva(uuid, uuid, text, int, text, numeric) from public;
grant execute on function public.crear_sustitucion_tolva(uuid, uuid, text, int, text, numeric) to authenticated;

-- ============================================================================
-- Cancelar deshace lo que hizo crear: si no, el surtido se queda con el sabor
-- entrante cargado y sin el saliente, y el operador llega con lo que no es.
-- ============================================================================

create or replace function public.cancelar_sustitucion_tolva(
  p_id uuid, p_motivo text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_s record;
  v_tolva record;
  v_cart_entrante int;
  v_cart_saliente int;
  v_gramaje_ent int;
  v_gramaje_sal int;
  v_cap_entrante int;
  v_surtido_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)
       or user_has_role('planeador'::app_role)) then
    raise exception 'Solo admin, dirección o planeación pueden cancelar sustituciones.';
  end if;

  select * into v_s from public.sustituciones_tolva where id = p_id for update;
  if v_s is null then raise exception 'Sustitución no encontrada'; end if;
  if v_s.estado <> 'pendiente' then
    raise exception 'Solo se puede cancelar una sustitución pendiente (está %).', v_s.estado;
  end if;

  update public.sustituciones_tolva
     set estado = 'cancelada', cancelada_at = now(), cancelada_por = v_uid,
         motivo_cancelacion = p_motivo
   where id = p_id;

  -- Deshacer el ajuste al surtido. La tolva no se tocó (la sustitución nunca se
  -- ejecutó), así que las mismas fórmulas dan las mismas cantidades.
  select * into v_tolva from public.tolvas where id = v_s.tolva_id;
  if v_tolva is null then return; end if;

  -- Mismas fórmulas que al crear, para restar exactamente lo que se había
  -- sumado: la capacidad del entrante sale de su propio producto (la tolva la
  -- recalcularía al ejecutarse), la del saliente es la que la tolva tiene hoy.
  select coalesce(gramaje_cartucho_default, 400),
         coalesce(v_tolva.capacidad_max_g_override, capacidad_g_por_tolva, 1200)
    into v_gramaje_ent, v_cap_entrante
    from public.productos where id = v_s.producto_entrante_id;
  select coalesce(gramaje_cartucho_default, 400) into v_gramaje_sal
    from public.productos where id = v_s.producto_saliente_id;

  v_cart_entrante := floor(
    v_cap_entrante::numeric / greatest(coalesce(v_gramaje_ent, 400), 1)
  );
  v_cart_saliente := floor(
    greatest(coalesce(v_tolva.capacidad_max_g, 1200) - coalesce(v_tolva.inventario_actual_g, 0), 0)::numeric
    / greatest(coalesce(v_gramaje_sal, 400), 1)
  );

  for v_surtido_id in
    select s.id
      from public.surtidos s
      join public.asignacion_maquinas am on am.asignacion_id = s.asignacion_id
     where am.maquina_id = v_s.maquina_id
       and s.estado in ('pendiente'::surtido_estado, 'en_proceso'::surtido_estado)
  loop
    -- Quita los cartuchos del entrante que había cargado la sustitución.
    update public.surtido_items
       set cartuchos_sugeridos  = greatest(cartuchos_sugeridos  - v_cart_entrante, 0),
           cartuchos_entregados = greatest(cartuchos_entregados - v_cart_entrante, 0)
     where surtido_id = v_surtido_id
       and maquina_id = v_s.maquina_id
       and producto_id = v_s.producto_entrante_id;

    delete from public.surtido_items
     where surtido_id = v_surtido_id
       and maquina_id = v_s.maquina_id
       and producto_id = v_s.producto_entrante_id
       and cartuchos_sugeridos = 0
       and cartuchos_entregados = 0
       and vasos_sugeridos = 0
       and vasos_entregados = 0;

    -- Regresa el saliente solo si al crear se había retirado: si el renglón
    -- sigue ahí es porque otra tolva de la máquina lo conserva, y sumarlo de
    -- nuevo lo duplicaría.
    if v_cart_saliente > 0
       and not exists (
         select 1 from public.surtido_items
          where surtido_id = v_surtido_id
            and maquina_id = v_s.maquina_id
            and producto_id = v_s.producto_saliente_id
       ) then
      insert into public.surtido_items (
        surtido_id, maquina_id, producto_id,
        cartuchos_sugeridos, cartuchos_entregados, notas
      ) values (
        v_surtido_id, v_s.maquina_id, v_s.producto_saliente_id,
        v_cart_saliente, v_cart_saliente,
        'Reposición por cancelación de sustitución en tolva #' || v_tolva.numero
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.cancelar_sustitucion_tolva(uuid, text) from public;
grant execute on function public.cancelar_sustitucion_tolva(uuid, text) to authenticated;
