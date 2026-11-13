-- ============================================================================
-- 160 · La Smart Energy vuelve a entrar a la ruta, pegada a su hermana de sitio
--
-- Los operadores lo cacharon en campo: desde que entró el agente, las Energy
-- dejaron de aparecerles. Los datos lo confirman con fecha exacta — renglones
-- de máquinas `tipo = 'servicio'` en `asignacion_maquinas`:
--
--   hasta el 10-nov   7 a 10 diarias, origen `base_ruta`
--   11-nov            **cero** ← primer día del agente
--   12 y 13-nov       5 y 1, todas `agregada_excepcion` (a mano, después)
--
-- La causa estaba en `src/lib/ruteo/estado.ts`:
--
--     .filter((m) => m.tipo !== "servicio")
--
-- La intención era buena —no quería que gastaran techo de paradas, porque no
-- venden y son otra clase de visita— pero las sacaba del estado por completo,
-- así que el agente nunca supo que existían. Con la ruta fija entraban solas
-- por estar en `ruta_maquinas`; el agente no usa `ruta_maquinas`.
--
-- Las 10 Energy comparten ubicación con una de vending, una a una. Para el
-- operador no son otra parada: ya está ahí, abre la otra máquina y le hace el
-- checklist con firma. Así que ahora viajan colgadas de su hermana:
--
--   · No entran a la lista de paradas del agente ni gastan techo.
--   · No suman tiempo a la parada. Dirección lo decidió así: el checklist es
--     corto y cabe dentro de lo que ya se presupuesta por parada. Si algún día
--     se alarga, el lugar de tocarlo es `optimizador.ts`.
--   · `aceptar_propuesta_ruteo` las inserta como renglón propio con el mismo
--     orden que su hermana, para que al operador le aparezcan en campo.
--   · El agente ve `servicio_en_sitio.visita_vencida` y puede subir la parada
--     por esa razón: una Energy sola nunca genera un viaje, y si no se cuelga
--     de alguien no la visita nadie.
--
-- El cambio en el RPC es el bloque del `v_srv`; lo demás es idéntico a
-- 20261112144931.
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
  v_srv      uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (user_has_role('admin'::app_role)
          or user_has_role('direccion'::app_role)
          or user_has_role('planeador'::app_role)) then
    raise exception 'Solo admin, dirección o planeación pueden aceptar propuestas.';
  end if;

  select id, fecha, estado, plan into v_prop
    from public.propuestas_ruteo where id = p_propuesta_id for update;

  if not found then raise exception 'No se encontró la propuesta.'; end if;
  if v_prop.estado <> 'generada' then
    raise exception 'Esta propuesta ya está %.', v_prop.estado;
  end if;
  if coalesce(jsonb_array_length(v_prop.plan), 0) = 0 then
    raise exception 'La propuesta no trae rutas.';
  end if;

  -- Paso 1 · revisar todos los choques antes de escribir nada
  for v_ruta in select * from jsonb_array_elements(v_prop.plan) loop
    if coalesce(jsonb_array_length(v_ruta->'paradas'), 0) = 0 then continue; end if;

    select array_agg((p->>'maquina_id')::uuid)
      into v_maquinas
      from jsonb_array_elements(v_ruta->'paradas') p;

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
       and a.operador_id = (v_ruta->>'operador_id')::uuid
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

  -- Paso 2 · escribir
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

      -- La Smart Energy del mismo sitio entra como su propio renglón, con el
      -- mismo orden que su hermana: el operador la ve pegada en la lista y no
      -- se mueve para atenderla. Sin esto, la máquina existe en el plan pero
      -- nunca le aparece en campo — que es justo lo que pasó el 11-nov.
      v_srv := nullif(v_parada->'servicio'->>'id','')::uuid;
      if v_srv is not null
         and not exists (select 1 from public.asignacion_maquinas
                          where asignacion_id = v_asig_id and maquina_id = v_srv) then
        insert into public.asignacion_maquinas (
          asignacion_id, maquina_id, orden, orden_sugerido, justificacion, origen
        ) values (
          v_asig_id, v_srv,
          (v_parada->>'orden')::int, (v_parada->>'orden')::int,
          'Smart Energy en el mismo sitio: checklist y firma, sin moverse de la parada.',
          'agente'
        );
      end if;
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
  'Convierte una propuesta del agente en asignaciones diarias, en una sola transacción. Revisa todos los choques antes de escribir y agrega la Smart Energy de cada sitio como renglón propio. Ver migraciones 20261112144931 y 20261113184835.';
