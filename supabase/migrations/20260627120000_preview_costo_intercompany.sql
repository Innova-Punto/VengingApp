-- ============================================================================
-- Preview de costo PEPS para venta intercompany (read-only, sin descontar).
-- Lo consume el form de "Nueva venta" para mostrar costo/precio/utilidad en
-- vivo antes de confirmar. Misma lógica PEPS que registrar_venta_intercompany.
-- ============================================================================

create or replace function public.preview_costo_intercompany(
  p_producto_id uuid,
  p_presentacion venta_intercompany_presentacion,
  p_cantidad int
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_costo numeric(14,2) := 0;
  v_disponible int := 0;
  r record;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('costo_total', 0, 'disponible', 0, 'suficiente', false);
  end if;

  if p_presentacion = 'granel'::venta_intercompany_presentacion then
    select coalesce(sum(gramos_disponibles_granel),0) into v_disponible
      from public.lotes where producto_id = p_producto_id and activo = true;
    for r in
      select gramos_disponibles_granel g, costo_por_gramo c
        from public.lotes
       where producto_id = p_producto_id and activo = true and gramos_disponibles_granel > 0
       order by fecha_recepcion asc, created_at asc
    loop
      exit when p_cantidad <= 0;
      declare tomar int := least(r.g, p_cantidad);
      begin
        v_costo := v_costo + round(tomar * r.c, 2);
        p_cantidad := p_cantidad - tomar;
      end;
    end loop;
  else
    select coalesce(sum(unidades_disponibles),0) into v_disponible
      from public.lotes where producto_id = p_producto_id and activo = true;
    for r in
      select unidades_disponibles u, costo_por_gramo c
        from public.lotes
       where producto_id = p_producto_id and activo = true and unidades_disponibles > 0
       order by fecha_recepcion asc, created_at asc
    loop
      exit when p_cantidad <= 0;
      declare tomar int := least(r.u, p_cantidad);
      begin
        v_costo := v_costo + round(tomar * r.c, 2);
        p_cantidad := p_cantidad - tomar;
      end;
    end loop;
  end if;

  return jsonb_build_object(
    'costo_total', v_costo,
    'disponible', v_disponible,
    'suficiente', (p_cantidad <= 0)
  );
end;
$$;

grant execute on function public.preview_costo_intercompany(uuid, venta_intercompany_presentacion, int) to authenticated;
