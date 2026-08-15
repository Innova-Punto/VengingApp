-- ============================================================================
-- 106 · Sustitución de producto en tolva (cambio de sabor)
--
-- CONTEXTO
-- Cuando un producto se descontinúa (p. ej. desabasto de ISO Chocolate), hay que
-- sustituirlo por otro en las tolvas. El polvo que queda en la tolva NO se tira:
-- se retira, se pesa, viaja a almacén y —si llega en buen estado— se recibe como
-- un LOTE NUEVO propio (separado del virgen) para poder re-encartucharlo.
--
-- QUIÉN DECIDE
-- Planeación (Mariana) marca la sustitución por tolva. El operador NO decide:
-- en la PWA ve la instrucción y el sistema le obliga a pesar el retiro y cargar
-- el producto entrante antes de poder cerrar la visita.
--
-- FLUJO
--   1. Planeación crea la orden        → estado 'pendiente'
--   2. Operador la ejecuta en campo    → estado 'ejecutada', retorno 'en_transito'
--        · descuenta la tolva a 0 valuando el polvo a su costo promedio
--        · cambia tolvas.producto_id al entrante (versiona planograma_historico)
--   3. Almacén recibe el polvo         → retorno 'recibido'  → crea LOTE recuperado
--      o lo rechaza por mal estado     → retorno 'rechazado' → merma
--
-- El polvo "en tránsito" no cuenta ni en máquina ni en almacén, igual que las
-- devoluciones de cartuchos pendientes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trazabilidad del lote recuperado
-- ----------------------------------------------------------------------------
alter table public.lotes
  add column if not exists es_recuperado boolean not null default false,
  add column if not exists maquina_origen_id uuid references public.maquinas(id);

-- Hasta ahora todo lote nacía de una recepción de compra. Los lotes recuperados
-- nacen de una tolva, no de una compra: recepcion_id deja de ser obligatorio.
-- (Relajar la restricción no afecta a los lotes existentes.)
alter table public.lotes alter column recepcion_id drop not null;

comment on column public.lotes.es_recuperado is
  'true = lote formado con polvo retirado de una tolva al sustituir producto. Se mantiene separado del producto virgen para trazabilidad y control de calidad.';
comment on column public.lotes.maquina_origen_id is
  'Máquina de la que se retiró el polvo (solo lotes recuperados).';

-- ----------------------------------------------------------------------------
-- 2. Órdenes de sustitución
-- ----------------------------------------------------------------------------
create table if not exists public.sustituciones_tolva (
  id uuid primary key default gen_random_uuid(),
  tolva_id uuid not null references public.tolvas(id) on delete restrict,
  maquina_id uuid not null references public.maquinas(id) on delete restrict,
  producto_saliente_id uuid not null references public.productos(id),
  producto_entrante_id uuid not null references public.productos(id),
  -- Config del producto entrante (si no se indica, hereda el default del producto)
  gramaje_servicio_entrante int check (gramaje_servicio_entrante is null or gramaje_servicio_entrante > 0),
  nayax_item_code_entrante text,
  precio_venta_entrante numeric(14,2),

  estado text not null default 'pendiente'
    check (estado in ('pendiente','ejecutada','cancelada')),
  motivo text,
  creado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),

  -- Ejecución en campo
  ejecutada_at timestamptz,
  ejecutada_por uuid references public.profiles(id),
  check_in_id uuid references public.check_ins(id),
  gramos_retirados int check (gramos_retirados is null or gramos_retirados >= 0),
  costo_por_gramo_retiro numeric(12,6),
  foto_retiro_url text,
  notas_operador text,

  -- Retorno del polvo a almacén
  estado_retorno text not null default 'sin_retorno'
    check (estado_retorno in ('sin_retorno','en_transito','recibido','rechazado')),
  gramos_recibidos int check (gramos_recibidos is null or gramos_recibidos >= 0),
  lote_retorno_id uuid references public.lotes(id),
  recibido_por uuid references public.profiles(id),
  recibido_at timestamptz,
  motivo_rechazo text,

  -- Cancelación
  cancelada_at timestamptz,
  cancelada_por uuid references public.profiles(id),
  motivo_cancelacion text,

  updated_at timestamptz not null default now(),
  check (producto_saliente_id <> producto_entrante_id)
);

-- Solo puede haber UNA sustitución pendiente por tolva a la vez
create unique index if not exists ux_sustitucion_pendiente_por_tolva
  on public.sustituciones_tolva (tolva_id) where estado = 'pendiente';

create index if not exists ix_sustituciones_maquina_estado
  on public.sustituciones_tolva (maquina_id, estado);
create index if not exists ix_sustituciones_retorno
  on public.sustituciones_tolva (estado_retorno) where estado_retorno = 'en_transito';

drop trigger if exists trg_sustituciones_updated_at on public.sustituciones_tolva;
create trigger trg_sustituciones_updated_at
  before update on public.sustituciones_tolva
  for each row execute function public.set_updated_at();

alter table public.sustituciones_tolva enable row level security;

drop policy if exists sustituciones_read on public.sustituciones_tolva;
create policy sustituciones_read on public.sustituciones_tolva
  for select to authenticated using (true);

drop policy if exists sustituciones_write on public.sustituciones_tolva;
create policy sustituciones_write on public.sustituciones_tolva
  for all to authenticated
  using (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)
      or user_has_role('planeador'::app_role) or user_has_role('almacen'::app_role))
  with check (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)
      or user_has_role('planeador'::app_role) or user_has_role('almacen'::app_role));

-- ----------------------------------------------------------------------------
-- 3. Planeación: crear la orden
-- ----------------------------------------------------------------------------
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

  -- El surtido suele generarse ANTES de que planeación decida la sustitución,
  -- así que trae cartuchos del producto que va a salir. Se retira ese sugerido
  -- para que almacén no cargue algo que el operador va a retirar el mismo día.
  --
  -- Solo se quita si a la máquina NO le queda otra tolva con ese producto (una
  -- máquina puede tener el mismo polvo en dos tolvas y sustituir solo una).
  -- Y solo en surtidos aún NO completados: los completados ya descontaron
  -- inventario y tocarlos rompería el kardex.
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

  return v_id;
exception when unique_violation then
  raise exception 'Esa tolva ya tiene una sustitución pendiente.';
end;
$$;

revoke all on function public.crear_sustitucion_tolva(uuid, uuid, text, int, text, numeric) from public;
grant execute on function public.crear_sustitucion_tolva(uuid, uuid, text, int, text, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Planeación: cancelar una orden pendiente
-- ----------------------------------------------------------------------------
create or replace function public.cancelar_sustitucion_tolva(
  p_id uuid, p_motivo text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_estado text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)
       or user_has_role('planeador'::app_role)) then
    raise exception 'Solo admin, dirección o planeación pueden cancelar sustituciones.';
  end if;

  select estado into v_estado from public.sustituciones_tolva where id = p_id;
  if v_estado is null then raise exception 'Sustitución no encontrada'; end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se puede cancelar una sustitución pendiente (está %).', v_estado;
  end if;

  update public.sustituciones_tolva
     set estado = 'cancelada', cancelada_at = now(), cancelada_por = v_uid,
         motivo_cancelacion = p_motivo
   where id = p_id;
end;
$$;

revoke all on function public.cancelar_sustitucion_tolva(uuid, text) from public;
grant execute on function public.cancelar_sustitucion_tolva(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Campo: ejecutar la sustitución (atómica)
--    Retira el polvo, deja la tolva en 0, cambia el producto y manda el polvo
--    a almacén en tránsito.
-- ----------------------------------------------------------------------------
create or replace function public.op_ejecutar_sustitucion(
  p_sustitucion_id uuid,
  p_check_in_id uuid,
  p_gramos_retirados int,
  p_foto_url text default null,
  p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_s record;
  v_tolva record;
  v_ci record;
  v_costo_g numeric(12,6);
  v_valor numeric(14,2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_gramos_retirados is null or p_gramos_retirados < 0 then
    raise exception 'Captura los gramos retirados (0 o más).';
  end if;

  select * into v_s from public.sustituciones_tolva where id = p_sustitucion_id for update;
  if v_s is null then raise exception 'Sustitución no encontrada'; end if;
  if v_s.estado <> 'pendiente' then
    raise exception 'Esta sustitución ya está %.', v_s.estado;
  end if;

  select * into v_ci from public.check_ins where id = p_check_in_id;
  if v_ci is null then raise exception 'Check-in no encontrado'; end if;
  if v_ci.maquina_id <> v_s.maquina_id then
    raise exception 'El check-in no corresponde a la máquina de la sustitución.';
  end if;
  if v_ci.operador_id <> v_uid
     and not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'No autorizado para este check-in';
  end if;

  select * into v_tolva from public.tolvas where id = v_s.tolva_id for update;
  v_costo_g := coalesce(v_tolva.costo_promedio_g_actual, 0);
  v_valor := round(p_gramos_retirados * v_costo_g, 2);

  -- 5.1 Salida del polvo de la tolva (kardex). El polvo queda EN TRÁNSITO:
  --     ya no está en la máquina y todavía no está en almacén.
  if p_gramos_retirados > 0 then
    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id, tolva_id, presentacion,
      cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, notas
    ) values (
      'retorno_polvo_tolva'::movimiento_tipo, v_s.producto_saliente_id,
      v_s.maquina_id, v_s.tolva_id, 'polvo_en_tolva'::mov_presentacion,
      0, 0, -p_gramos_retirados, v_costo_g, -v_valor,
      'sustituciones_tolva', p_sustitucion_id, v_uid,
      'Retiro por sustitución de producto'
    );
  end if;

  -- 5.2 La tolva queda vacía y cambia de producto
  update public.tolvas set
    producto_id = v_s.producto_entrante_id,
    gramaje_servicio = coalesce(v_s.gramaje_servicio_entrante, gramaje_servicio),
    nayax_item_code = coalesce(v_s.nayax_item_code_entrante, nayax_item_code),
    precio_venta = coalesce(v_s.precio_venta_entrante, precio_venta),
    inventario_actual_g = 0,
    costo_promedio_g_actual = 0,
    ultimo_pesaje_at = now()
  where id = v_s.tolva_id;

  -- 5.3 El trigger log_planograma_cambio ya versionó el cambio al hacer el
  --     UPDATE de arriba. Aquí solo precisamos el motivo (no insertamos otra
  --     fila: duplicaría el histórico).
  update public.planograma_historico
     set motivo_cambio = 'Sustitución de producto programada por planeación'
   where maquina_id = v_s.maquina_id
     and tolva_numero = v_tolva.numero
     and vigente_hasta is null;

  -- 5.4 Cierra la orden
  update public.sustituciones_tolva set
    estado = 'ejecutada',
    ejecutada_at = now(), ejecutada_por = v_uid, check_in_id = p_check_in_id,
    gramos_retirados = p_gramos_retirados,
    costo_por_gramo_retiro = v_costo_g,
    foto_retiro_url = p_foto_url,
    notas_operador = p_notas,
    estado_retorno = case when p_gramos_retirados > 0 then 'en_transito' else 'sin_retorno' end
  where id = p_sustitucion_id;

  return p_sustitucion_id;
end;
$$;

revoke all on function public.op_ejecutar_sustitucion(uuid, uuid, int, text, text) from public;
grant execute on function public.op_ejecutar_sustitucion(uuid, uuid, int, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Almacén: recibir el polvo (crea el LOTE recuperado) o rechazarlo (merma)
-- ----------------------------------------------------------------------------
create or replace function public.recibir_retorno_polvo(
  p_sustitucion_id uuid,
  p_aceptado boolean,
  p_gramos_recibidos int default null,
  p_motivo_rechazo text default null,
  p_fecha_caducidad date default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_s record;
  v_lote_id uuid;
  v_codigo text;
  v_gramos int;
  v_valor numeric(14,2);
  v_proveedor_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)
       or user_has_role('almacen'::app_role)) then
    raise exception 'Solo admin, dirección o almacén pueden recibir retornos.';
  end if;

  select * into v_s from public.sustituciones_tolva where id = p_sustitucion_id for update;
  if v_s is null then raise exception 'Sustitución no encontrada'; end if;
  if v_s.estado_retorno <> 'en_transito' then
    raise exception 'Este retorno está en estado %, no se puede recibir.', v_s.estado_retorno;
  end if;

  -- ══ RECHAZADO: el polvo llegó en mal estado → merma ══
  if not p_aceptado then
    v_valor := round(coalesce(v_s.gramos_retirados,0) * coalesce(v_s.costo_por_gramo_retiro,0), 2);
    insert into public.movimientos_inventario (
      tipo, producto_id, maquina_id, presentacion,
      cantidad_cartuchos, cantidad_vasos, gramos,
      costo_por_gramo_snapshot, valor_movimiento,
      referencia_tabla, referencia_id, usuario_id, notas
    ) values (
      'merma_ruta'::movimiento_tipo, v_s.producto_saliente_id, v_s.maquina_id,
      'granel'::mov_presentacion, 0, 0, -coalesce(v_s.gramos_retirados,0),
      coalesce(v_s.costo_por_gramo_retiro,0), -v_valor,
      'sustituciones_tolva', p_sustitucion_id, v_uid,
      'Retorno rechazado: ' || coalesce(p_motivo_rechazo, 'sin motivo')
    );

    update public.sustituciones_tolva set
      estado_retorno = 'rechazado', recibido_por = v_uid, recibido_at = now(),
      motivo_rechazo = p_motivo_rechazo, gramos_recibidos = 0
    where id = p_sustitucion_id;

    return null;
  end if;

  -- ══ ACEPTADO: nace el lote recuperado ══
  v_gramos := coalesce(p_gramos_recibidos, v_s.gramos_retirados, 0);
  if v_gramos <= 0 then
    raise exception 'Captura los gramos recibidos (mayor a 0) o rechaza el retorno.';
  end if;
  v_valor := round(v_gramos * coalesce(v_s.costo_por_gramo_retiro,0), 2);

  v_codigo := 'LOT-REC-' || to_char(now(), 'YYYYMMDD') || '-' ||
              upper(substring(replace(p_sustitucion_id::text, '-', '') from 1 for 6));

  -- El lote recuperado hereda el proveedor del origen del producto (el polvo
  -- vino de ahí originalmente); lotes.proveedor_id es NOT NULL.
  select l.proveedor_id into v_proveedor_id
    from public.lotes l
   where l.producto_id = v_s.producto_saliente_id and l.proveedor_id is not null
   order by l.fecha_recepcion desc, l.created_at desc
   limit 1;

  if v_proveedor_id is null then
    select pp.proveedor_id into v_proveedor_id
      from public.presentaciones_proveedor pp
     where pp.producto_id = v_s.producto_saliente_id
     order by pp.activo desc
     limit 1;
  end if;

  if v_proveedor_id is null then
    raise exception 'No se pudo determinar el proveedor de origen del producto. Registra una presentación de proveedor para este producto antes de recibir el retorno.';
  end if;

  insert into public.lotes (
    codigo_lote, producto_id, proveedor_id, fecha_recepcion, fecha_caducidad,
    gramos_iniciales, gramos_disponibles_granel, costo_por_gramo,
    es_recuperado, maquina_origen_id, activo, notas
  ) values (
    v_codigo, v_s.producto_saliente_id, v_proveedor_id, current_date, p_fecha_caducidad,
    v_gramos, v_gramos, coalesce(v_s.costo_por_gramo_retiro, 0),
    true, v_s.maquina_id, true,
    'Polvo recuperado por sustitución de producto en tolva'
  ) returning id into v_lote_id;

  insert into public.movimientos_inventario (
    tipo, producto_id, lote_id, maquina_id, presentacion,
    cantidad_cartuchos, cantidad_vasos, gramos,
    costo_por_gramo_snapshot, valor_movimiento,
    referencia_tabla, referencia_id, usuario_id, notas
  ) values (
    'retorno_polvo_tolva'::movimiento_tipo, v_s.producto_saliente_id, v_lote_id,
    v_s.maquina_id, 'granel'::mov_presentacion, 0, 0, v_gramos,
    coalesce(v_s.costo_por_gramo_retiro,0), v_valor,
    'sustituciones_tolva', p_sustitucion_id, v_uid,
    'Ingreso a almacén como lote recuperado ' || v_codigo
  );

  update public.sustituciones_tolva set
    estado_retorno = 'recibido', recibido_por = v_uid, recibido_at = now(),
    gramos_recibidos = v_gramos, lote_retorno_id = v_lote_id
  where id = p_sustitucion_id;

  return v_lote_id;
end;
$$;

revoke all on function public.recibir_retorno_polvo(uuid, boolean, int, text, date) from public;
grant execute on function public.recibir_retorno_polvo(uuid, boolean, int, text, date) to authenticated;
