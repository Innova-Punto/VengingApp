-- ============================================================================
-- 84 · IVA en ventas: ingreso neto sin IVA (el IVA es del SAT, no ingreso)
--
-- Antes: la utilidad y el margen se calculaban con el precio CON IVA, mientras
-- los costos son SIN IVA → margen inflado ~7 pts. Se corrige:
--   iva            = precio_bruto * 16/116
--   precio_sin_iva = precio_bruto / 1.16   (base gravable / ingreso)
--   precio_neto    = precio_sin_iva - comision_nayax   (comisión sobre bruto)
--   utilidad_bruta = precio_neto - costo_polvo - costo_vaso
--   margen         = utilidad / precio_neto
--
-- Se recalcularon TODAS las ventas históricas (÷1.16). procesar_venta_nayax y
-- agregar_ventas (KPIs con 'iva' e 'ingreso_sin_iva') quedaron actualizadas en
-- el remoto. Tasa 16% para todos los productos.
-- ============================================================================

alter table public.ventas_maquina
  add column if not exists iva numeric(14,2),
  add column if not exists precio_sin_iva numeric(14,2);

-- Backfill histórico
update public.ventas_maquina set
  iva = round(coalesce(precio_bruto,0) * 16.0/116.0, 2),
  precio_sin_iva = round(coalesce(precio_bruto,0) / 1.16, 2),
  precio_neto = round(coalesce(precio_bruto,0)/1.16, 2) - coalesce(comision_nayax_estimada,0),
  utilidad_bruta = (round(coalesce(precio_bruto,0)/1.16, 2) - coalesce(comision_nayax_estimada,0))
                   - (coalesce(costo_polvo,0) + coalesce(costo_vaso,0)),
  margen_porcentaje = case
    when (round(coalesce(precio_bruto,0)/1.16,2) - coalesce(comision_nayax_estimada,0)) <> 0
    then round(((round(coalesce(precio_bruto,0)/1.16,2) - coalesce(comision_nayax_estimada,0))
       - (coalesce(costo_polvo,0)+coalesce(costo_vaso,0)))
      / (round(coalesce(precio_bruto,0)/1.16,2) - coalesce(comision_nayax_estimada,0)) * 100, 2)
    else null end
where iva is null or true;

-- NOTA: procesar_venta_nayax y agregar_ventas se actualizaron (cuerpos vigentes
-- aplicados en el proyecto remoto): calculan iva/precio_sin_iva y exponen los
-- KPIs 'iva' e 'ingreso_sin_iva'.
