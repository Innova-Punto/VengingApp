-- ============================================================================
-- 147 · Portal del cliente: servicios propios, en lugar de la pantalla interna
--
-- Qué pasaba
-- ----------
-- El menú del cliente seguía apuntando a `/admin/servicios`, una pantalla
-- interna que lee las tablas a través de RLS. Con una cuenta de cliente el
-- listado tronaba con `canceling statement due to statement timeout`.
--
-- La causa, medida con EXPLAIN ANALYZE: la policy
-- `servicio_respuestas_cliente_read` re-deriva la propiedad del cliente
-- recorriendo servicio_visitas → maquinas → ubicaciones **por cada renglón de
-- respuesta**, y cada una de esas tablas vuelve a derivarla en su propia
-- policy. Los subplanes anidados se ejecutaban 3,100 veces cada uno. Solo
-- contar las respuestas de 100 visitas tardaba 2.6 s; la pantalla real además
-- encadena maquinas → ubicaciones → clientes, y se pasa del tope.
--
-- Para un interno no se nota: su policy corta en el primer `user_has_role` y
-- nunca entra al anidado. Es un problema exclusivo del camino del cliente.
--
-- La solución
-- -----------
-- La misma regla que ya quedó escrita en CLAUDE.md §4.6: **una pantalla de
-- cliente nunca apunta a una tabla ni a una pantalla interna.** Esta vista
-- resuelve la propiedad UNA vez, y agrega el checklist adentro — donde corre
-- como dueño y no paga RLS por renglón.
--
-- Igual que el resto de `v_cliente_*`: sin costos, y sin el nombre del líder
-- ni la URL de su firma, que son datos de una persona identificable.
-- ============================================================================

create or replace view public.v_cliente_servicios as
select
  sv.id,
  sv.folio,
  sv.fecha,
  sv.maquina_id,
  m.serie,
  m.alias                  as maquina,
  u.nombre                 as ubicacion,
  pr.full_name             as operador,
  sv.producto_repuesto,
  sv.cantidad_repuesta,
  sv.inventario_sf,
  sv.observaciones,
  -- La firma se reporta como hecho, no como imagen: al cliente le sirve saber
  -- que su líder firmó, no quién ni con qué trazo.
  (sv.firma_url is not null)      as firmada,
  sv.firma_no_disponible,
  sv.firma_motivo,
  coalesce(r.total, 0)            as checklist_total,
  coalesce(r.bien, 0)             as checklist_bien,
  coalesce(r.mal, 0)              as checklist_mal
from public.servicio_visitas sv
join public.maquinas m     on m.id = sv.maquina_id
join public.ubicaciones u  on u.id = m.ubicacion_id
left join public.profiles pr on pr.id = sv.operador_id
left join lateral (
  select
    count(*)                                  as total,
    count(*) filter (where sr.estado = 'bien') as bien,
    count(*) filter (where sr.estado = 'mal')  as mal
  from public.servicio_respuestas sr
  where sr.visita_id = sv.id
) r on true
where u.cliente_id = public.user_cliente_id();

revoke all on public.v_cliente_servicios from public, anon;
grant select on public.v_cliente_servicios to authenticated;

comment on view public.v_cliente_servicios is
  'Portal del cliente: visitas de servicio con el checklist ya agregado. Resuelve la propiedad una sola vez, en vez de que RLS la re-derive por cada respuesta. Sin nombre ni firma del líder.';
