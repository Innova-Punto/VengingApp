-- ============================================================================
-- Edición administrativa del conteo de vasos en un pesaje.
--
-- Acepta también capturar el conteo en pesajes que no lo registraron (cuando
-- `vasos_medidos` es NULL pero la máquina sí tiene vaso configurado).
-- En todos los casos:
--   - Calcula el delta contra el valor previo (NULL → 0 para el delta).
--   - Actualiza maquinas.vaso_inventario_actual por el delta.
--   - Re-calcula valor_diferencia con el último lote activo del vaso;
--     si no hay lote, conserva el costo unitario que el pesaje ya tenía
--     (para no perder el costo tentativo del backfill).
--   - Inserta un movimiento `ajuste_conteo_maquina` con el delta y el motivo.
-- ============================================================================

create or replace function public.editar_pesaje_vasos(
  p_pesaje_id     uuid,
  p_nuevos_vasos  integer,
  p_motivo        text default null
) returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pesaje record;
  v_maquina record;
  v_previo int;
  v_delta int;
  v_nuevo_diff int;
  v_costo numeric;
  v_nuevo_valor numeric(14, 2);
  v_alerta boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role) or user_has_role('direccion'::app_role)) then
    raise exception 'Solo admin o dirección pueden editar pesajes';
  end if;
  if p_nuevos_vasos is null or p_nuevos_vasos < 0 then
    raise exception 'vasos_medidos debe ser un entero >= 0';
  end if;

  select * into v_pesaje from public.pesajes_maquina where id = p_pesaje_id;
  if v_pesaje is null then
    raise exception 'Pesaje % no existe', p_pesaje_id;
  end if;

  select * into v_maquina from public.maquinas where id = v_pesaje.maquina_id;
  if v_maquina.vaso_producto_id is null then
    raise exception 'La máquina % no tiene vaso configurado', v_maquina.serie;
  end if;

  v_previo := coalesce(v_pesaje.vasos_medidos, 0);
  v_delta  := p_nuevos_vasos - v_previo;
  if v_delta = 0 then
    return;
  end if;

  select l.costo_por_gramo into v_costo
    from public.lotes l
   where l.producto_id = v_maquina.vaso_producto_id
     and l.activo = true
   order by l.created_at desc
   limit 1;
  v_costo := coalesce(v_costo, v_pesaje.vasos_costo_unitario, 0);

  v_nuevo_diff := p_nuevos_vasos - coalesce(v_pesaje.vasos_teoricos, 0);
  v_nuevo_valor := round(v_nuevo_diff * v_costo, 2);
  v_alerta := coalesce(v_pesaje.vasos_teoricos, 0) > 0
              and abs(v_nuevo_diff)::numeric / v_pesaje.vasos_teoricos >= 0.05;

  update public.pesajes_maquina set
    vasos_medidos          = p_nuevos_vasos,
    vasos_teoricos         = coalesce(vasos_teoricos, 0),
    vasos_costo_unitario   = nullif(v_costo, 0),
    vasos_valor_diferencia = v_nuevo_valor,
    vasos_alerta_generada  = coalesce(v_alerta, false),
    notas = case
      when p_motivo is null or p_motivo = '' then notas
      else coalesce(notas || E'\n', '') || '[' || now()::text || '] edición vasos: ' || p_motivo
    end
  where id = p_pesaje_id;

  update public.maquinas set
    vaso_inventario_actual = coalesce(vaso_inventario_actual, 0) + v_delta
  where id = v_maquina.id;

  insert into public.movimientos_inventario (
    tipo, producto_id, maquina_id, tolva_id,
    presentacion, cantidad_cartuchos, cantidad_vasos, gramos,
    costo_por_gramo_snapshot, valor_movimiento,
    referencia_tabla, referencia_id, usuario_id, notas
  ) values (
    'ajuste_conteo_maquina'::movimiento_tipo,
    v_maquina.vaso_producto_id, v_maquina.id, null,
    'vaso'::mov_presentacion,
    0, v_delta, 0,
    v_costo,
    round(v_delta * v_costo, 2),
    'pesajes_maquina', p_pesaje_id, v_uid,
    'Edición vasos · delta ' || v_delta ||
    case when p_motivo is null then '' else ' · ' || p_motivo end
  );
end;
$function$;

grant execute on function public.editar_pesaje_vasos(uuid, integer, text) to authenticated;
