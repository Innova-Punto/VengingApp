-- ============================================================================
-- 158 · Aceptar la propuesta del agente, todo o nada
--
-- Aceptar creaba las asignaciones una por una en un `for` de TypeScript. Si la
-- cuarta chocaba, las tres primeras ya estaban escritas y la propuesta se
-- quedaba en "generada". De ahí ese paréntesis del mensaje de error:
--
--   "(Se crearon 0 antes de este error.)"
--
-- Hoy ese número fue 0 y no pasó nada. Cuando sea 2, Mariana se queda con dos
-- asignaciones huérfanas que ella no pidió, una propuesta sin aceptar, y la
-- única forma de volver al punto de partida es borrarlas a mano adivinando
-- cuáles eran. Es exactamente lo que nos pasó con los surtidos en octubre
-- (migración 20261005184113) y la lección fue la misma: una operación que el
-- usuario vive como un solo clic tiene que ser una sola transacción.
--
-- Aquí el trabajo lo hace Postgres: si algo truena, no quedó nada escrito.
--
-- Dos cosas que además se arreglan de paso:
--
--   · Los choques se revisan **todos antes de escribir nada**, así que el
--     mensaje puede nombrar las rutas que estorban en una sola pasada, en vez
--     de descubrirlas de una en una a punta de reintentos.
--   · El mensaje dice quién tiene la asignación y en qué estado está. El de
--     antes solo decía "cancélala primero", que cuando la asignación ya estaba
--     cancelada era un callejón sin salida.
-- ============================================================================

create or replace function public.aceptar_propuesta_ruteo(
  p_propuesta_id uuid
)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid      uuid := auth.uid();
  v_prop     record;
  v_ruta     jsonb;
  v_parada   jsonb;
  v_ruta_id  uuid;
  v_nombre   text;
  v_asig_id  uuid;
  v_maquinas uuid[];
  v_creadas  int := 0;
  v_choques  text[] := '{}';
  v_choque   record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role)
          or user_has_role('direccion'::app_role)
          or user_has_role('planeador'::app_role)) then
    raise exception 'Solo admin, dirección o planeación pueden aceptar propuestas.';
  end if;

  -- `for update` para que dos clics seguidos no creen las asignaciones dos
  -- veces: el segundo espera y encuentra la propuesta ya aceptada.
  select id, fecha, estado, plan into v_prop
    from public.propuestas_ruteo where id = p_propuesta_id for update;

  if not found then raise exception 'No se encontró la propuesta.'; end if;
  if v_prop.estado <> 'generada' then
    raise exception 'Esta propuesta ya está %.', v_prop.estado;
  end if;
  if coalesce(jsonb_array_length(v_prop.plan), 0) = 0 then
    raise exception 'La propuesta no trae rutas.';
  end if;

  -- ── Paso 1 · Revisar TODO antes de escribir nada ──────────────────────────
  for v_ruta in select * from jsonb_array_elements(v_prop.plan) loop
    if coalesce(jsonb_array_length(v_ruta->'paradas'), 0) = 0 then continue; end if;

    select array_agg((p->>'maquina_id')::uuid)
      into v_maquinas
      from jsonb_array_elements(v_ruta->'paradas') p;

    -- La ruta de la asignación es la más representada entre las máquinas
    -- elegidas: el modelo exige `ruta_id` y es única por fecha.
    select rm.ruta_id, r.nombre into v_ruta_id, v_nombre
      from public.ruta_maquinas rm
      join public.rutas r on r.id = rm.ruta_id
     where rm.maquina_id = any(v_maquinas) and r.activa
     group by rm.ruta_id, r.nombre
     order by count(*) desc
     limit 1;

    if v_ruta_id is null then
      raise exception 'Las máquinas de % no pertenecen a ninguna ruta activa.',
        coalesce(v_ruta->>'operador_nombre', 'uno de los operadores');
    end if;

    select r.nombre, a.estado::text as estado, p.full_name into v_choque
      from public.asignaciones_diarias a
      join public.rutas r on r.id = a.ruta_id
      left join public.profiles p on p.id = a.operador_id
     where a.fecha = v_prop.fecha and a.ruta_id = v_ruta_id
       and a.estado <> 'cancelada'
     limit 1;

    if found then
      v_choques := v_choques || format('%s (%s, %s)',
        v_choque.nombre, coalesce(v_choque.full_name, 'sin operador'), v_choque.estado);
    end if;
  end loop;

  if array_length(v_choques, 1) > 0 then
    raise exception
      'Estas rutas ya tienen asignación vigente el %: %. Cancélalas en Asignaciones y vuelve a aceptar. No se creó ninguna.',
      v_prop.fecha, array_to_string(v_choques, ' · ');
  end if;

  -- ── Paso 2 · Escribir ─────────────────────────────────────────────────────
  for v_ruta in select * from jsonb_array_elements(v_prop.plan) loop
    if coalesce(jsonb_array_length(v_ruta->'paradas'), 0) = 0 then continue; end if;

    select array_agg((p->>'maquina_id')::uuid)
      into v_maquinas
      from jsonb_array_elements(v_ruta->'paradas') p;

    select rm.ruta_id into v_ruta_id
      from public.ruta_maquinas rm
      join public.rutas r on r.id = rm.ruta_id
     where rm.maquina_id = any(v_maquinas) and r.activa
     group by rm.ruta_id
     order by count(*) desc
     limit 1;

    insert into public.asignaciones_diarias (
      fecha, ruta_id, operador_id, notas, creado_por, estado
    ) values (
      v_prop.fecha, v_ruta_id, (v_ruta->>'operador_id')::uuid,
      format('Propuesta del agente de ruteo · %s paradas · %s km · %s h estimadas',
             jsonb_array_length(v_ruta->'paradas'),
             v_ruta->>'km_total', v_ruta->>'horas_estimadas'),
      v_uid, 'planeada'
    ) returning id into v_asig_id;

    for v_parada in select * from jsonb_array_elements(v_ruta->'paradas') loop
      insert into public.asignacion_maquinas (
        asignacion_id, maquina_id, orden, orden_sugerido, justificacion, origen
      ) values (
        v_asig_id, (v_parada->>'maquina_id')::uuid,
        (v_parada->>'orden')::int, (v_parada->>'orden')::int,
        v_parada->>'motivo', 'agente'
      );
    end loop;

    v_creadas := v_creadas + 1;
  end loop;

  update public.propuestas_ruteo
     set estado = 'aceptada', decidida_por = v_uid, decidida_at = now()
   where id = p_propuesta_id;

  return v_creadas;
end;
$$;

comment on function public.aceptar_propuesta_ruteo(uuid) is
  'Convierte una propuesta del agente en asignaciones diarias, en una sola transacción. Revisa todos los choques antes de escribir. Ver migración 20261112001000.';

revoke all on function public.aceptar_propuesta_ruteo(uuid) from public, anon;
grant execute on function public.aceptar_propuesta_ruteo(uuid) to authenticated;
