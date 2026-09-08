-- ============================================================================
-- Dos correcciones a `v_agua_maquina`, encontradas simulando la visita real.
--
-- 1. **La carga simultánea a la medición se perdía.** El filtro era
--    `carga.fecha > medicion.fecha`, y cuando los dos eventos caen en el mismo
--    instante —el operador mide y carga en la misma pantalla, y dentro de una
--    transacción `now()` es constante— la carga quedaba empatada y se
--    descartaba: 12.5 L medidos + 40 L cargados daban 12.5 L. Ahora es `>=`:
--    una carga del mismo instante pertenece a esa visita y cuenta.
--
-- 2. **El estimado podía exceder el tanque.** ¼ de tanque más dos garrafones
--    son 52.5 L en un tanque de 50: físicamente imposible. El estimado se topa
--    en la capacidad, y el exceso se expone en `carga_excede_capacidad` en
--    lugar de esconderse — normalmente significa que se capturaron más
--    garrafones de los que de verdad se vaciaron.
--
-- Se dropea antes de recrear porque cambia la lista de columnas, y
-- `create or replace view` no lo permite.
-- ============================================================================

drop view if exists public.v_agua_maquina;

create view public.v_agua_maquina as
with param as (
  select coalesce((select valor::numeric from public.config_global where clave = 'agua_ml_por_bebida'), 300) as ml_bebida
),
ultima as (
  select distinct on (maquina_id) maquina_id, fecha, ml_medidos
    from public.agua_maquina_eventos
   where tipo in ('medicion','ajuste') and ml_medidos is not null
   order by maquina_id, fecha desc
),
cargas as (
  select e.maquina_id, sum(e.ml_cargados) as ml
    from public.agua_maquina_eventos e
    left join ultima u on u.maquina_id = e.maquina_id
   where e.tipo = 'carga'
     -- `>=`: la carga del mismo instante es la de esta visita, no la de antes.
     and e.fecha >= coalesce(u.fecha, '-infinity'::timestamptz)
   group by e.maquina_id
),
consumo as (
  select v.maquina_id, count(*) as ventas
    from public.ventas_maquina v
    join ultima u on u.maquina_id = v.maquina_id
   where v.fecha_transaccion > u.fecha
   group by v.maquina_id
),
ritmo as (
  select maquina_id, count(*)::numeric / 30 as ventas_dia
    from public.ventas_maquina
   where fecha_transaccion >= now() - interval '30 days'
   group by maquina_id
),
base as (
  select m.id                        as maquina_id,
         m.serie,
         m.alias,
         m.agua_capacidad_ml,
         u.fecha                     as ultima_medicion,
         u.ml_medidos                as ml_ultima_medicion,
         coalesce(c.ml, 0)::int      as ml_cargados_desde,
         coalesce(co.ventas, 0)::int as ventas_desde,
         round(coalesce(r.ventas_dia, 0) * p.ml_bebida)::int as ml_por_dia,
         -- Sin medición previa no hay baseline y el estimado no existe.
         case when u.fecha is null then null
              else u.ml_medidos + coalesce(c.ml, 0)
                   - (coalesce(co.ventas, 0) * p.ml_bebida)
         end                         as ml_crudo,
         case when u.fecha is null then false
              else u.ml_medidos + coalesce(c.ml, 0) > m.agua_capacidad_ml
         end                         as carga_excede_capacidad
    from public.maquinas m
    cross join param p
    left join ultima  u  on u.maquina_id  = m.id
    left join cargas  c  on c.maquina_id  = m.id
    left join consumo co on co.maquina_id = m.id
    left join ritmo   r  on r.maquina_id  = m.id
   where m.activo and m.requiere_agua
)
select maquina_id,
       serie,
       alias,
       agua_capacidad_ml,
       ultima_medicion,
       ml_ultima_medicion,
       ml_cargados_desde,
       ventas_desde,
       ml_por_dia,
       carga_excede_capacidad,
       -- En un tanque de 50 L no caben 52: se topa en la capacidad.
       case when ml_crudo is null then null
            else greatest(least(ml_crudo, agua_capacidad_ml), 0)::int
       end as ml_estimado,
       case when ml_crudo is null or ml_por_dia = 0 then null
            else round(greatest(least(ml_crudo, agua_capacidad_ml), 0)::numeric
                       / ml_por_dia, 1)
       end as dias_para_vaciarse,
       (ultima_medicion is null) as sin_medicion
  from base;

alter view public.v_agua_maquina set (security_invoker = true);

comment on view public.v_agua_maquina is
  'Agua estimada al momento por máquina. sin_medicion = nunca se ha reportado nivel: el estimado no existe, no es cero. carga_excede_capacidad = se reportó más agua de la que cabe en el tanque.';
