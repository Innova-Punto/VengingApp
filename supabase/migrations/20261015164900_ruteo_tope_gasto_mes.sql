-- ============================================================================
-- 145 · Tope de gasto mensual del agente de ruteo
--
-- Por qué
-- -------
-- El agente le cuesta dinero a la empresa cada vez que corre, y ese dinero hoy
-- no se ve en ningún lado: hay que ir a la consola de Anthropic a buscarlo. El
-- 13-oct-2026 la cuenta se quedó sin saldo a media mañana y nadie se enteró
-- hasta que Mariana le dio al botón y le salió un error que no hablaba de
-- facturación.
--
-- Qué NO es esto
-- --------------
-- No es un presupuesto para apretar la calidad del plan. Dirección fue
-- explícita: prefiere gastar más y que la optimización sea real. El tope está
-- alto a propósito —el gasto medido es de ~$0.53 USD por corrida, o sea unos
-- $12 a $18 al mes con una corrida diaria— y sirve como alarma contra una
-- fuga: un cron en bucle, un reintento desbocado, alguien dándole al botón
-- cincuenta veces. En operación normal nunca se dispara.
--
-- Se guarda en config_global para poder subirlo sin un deploy: si un mes hace
-- falta correr el agente más seguido, se cambia el número y ya.
-- ============================================================================

-- `clave` no tiene índice único, así que el guardia es un `not exists` y no un
-- `on conflict`: así la migración se puede volver a correr sin duplicar la fila.
insert into public.config_global (clave, valor, tipo_dato, descripcion)
select
  'ruteo_tope_usd_mes',
  '75',
  'numero',
  'Alarma de gasto del agente de ruteo, en USD por mes calendario (CDMX). NO es un presupuesto: el gasto medido es ~$0.53 por corrida (~$12-18 al mes con una diaria), así que 75 deja muchísima holgura. Existe para atajar una fuga —un cron en bucle o reintentos desbocados—, no para recortar la calidad del plan. Si hace falta correr más seguido, súbelo.'
where not exists (
  select 1 from public.config_global where clave = 'ruteo_tope_usd_mes'
);

-- El gasto del mes corriente, en dólares. El mes se corta en CDMX y no en UTC:
-- si no, las corridas de la tarde del último día caerían en el mes siguiente y
-- el número no cuadraría con lo que cualquiera entiende por "este mes".
create or replace function public.ruteo_gasto_mes_usd()
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(costo_usd), 0)::numeric
    from public.propuestas_ruteo
   where date_trunc('month', created_at at time zone 'America/Mexico_City')
       = date_trunc('month', now() at time zone 'America/Mexico_City');
$$;

revoke all on function public.ruteo_gasto_mes_usd() from public;
grant execute on function public.ruteo_gasto_mes_usd() to authenticated;

comment on function public.ruteo_gasto_mes_usd() is
  'Gasto acumulado del agente de ruteo en el mes calendario corriente (CDMX), en USD.';
