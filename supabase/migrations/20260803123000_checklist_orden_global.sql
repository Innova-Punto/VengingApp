-- ============================================================================
-- 100 · Checklist: orden global por plantilla
--
-- El seed original numeraba `orden` por sección (1..n en cada una), lo que
-- no permite ordenar las secciones al renderizar. Se recalcula `orden` como
-- consecutivo global respetando el orden natural de las secciones del
-- checklist Smart Energy. Idempotente.
-- ============================================================================

with ordenado as (
  select ci.id,
         row_number() over (
           partition by ci.plantilla_id
           order by
             case ci.seccion
               when 'Limpieza' then 1
               when 'Equipo' then 2
               when 'Biométrico' then 3
               when 'Mueble' then 4
               when 'Producto' then 5
               when 'Prueba de funcionamiento' then 6
               else 99
             end,
             ci.orden, ci.nombre
         ) as rn
    from public.checklist_items ci
    join public.checklist_plantillas p on p.id = ci.plantilla_id
   where p.nombre = 'Servicio Smart Energy'
)
update public.checklist_items ci
   set orden = o.rn
  from ordenado o
 where ci.id = o.id
   and ci.orden <> o.rn;
