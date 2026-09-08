/**
 * Agua: helpers compartidos entre campo, almacén y planeación.
 *
 * Todo se maneja en **mililitros enteros**, igual que los polvos en gramos.
 * Un garrafón son 20 L; un tanque de máquina, 50 L; una bebida, 300 ml.
 */

/** Garrafón estándar. El valor vigente vive en `config_global.agua_ml_por_garrafon`. */
export const ML_POR_GARRAFON = 20_000;

/** Consumo por bebida. El vigente vive en `config_global.agua_ml_por_bebida`. */
export const ML_POR_BEBIDA = 300;

export function mlALitros(ml: number | null | undefined): string {
  if (ml == null) return "—";
  const l = ml / 1000;
  return Number.isInteger(l) ? `${l} L` : `${l.toFixed(1)} L`;
}

/**
 * Las opciones que ve el operador. El tanque es transparente pero no tiene
 * escala, así que pedir mililitros exactos sería precisión inventada: se
 * captura por fracciones de lo que alcanza a ver.
 */
export function fraccionesTanque(
  capacidadMl: number,
): { etiqueta: string; ml: number }[] {
  return [
    { etiqueta: "Vacío", ml: 0 },
    { etiqueta: "¼", ml: Math.round(capacidadMl * 0.25) },
    { etiqueta: "½", ml: Math.round(capacidadMl * 0.5) },
    { etiqueta: "¾", ml: Math.round(capacidadMl * 0.75) },
    { etiqueta: "Lleno", ml: capacidadMl },
  ];
}

/**
 * Qué tan grave es la diferencia entre lo que el sistema esperaba y lo que el
 * operador encontró. Un tanque destapado se evapora y el operador redondea a
 * cuartos, así que una diferencia chica es ruido, no fuga: el umbral es medio
 * cuarto de tanque (~6 L en uno de 50) para no gritar por nada.
 */
export function severidadDiferencia(
  mlTeoricos: number | null,
  mlMedidos: number | null,
  capacidadMl: number,
): "sin_dato" | "normal" | "revisar" {
  if (mlTeoricos == null || mlMedidos == null) return "sin_dato";
  const tolerancia = capacidadMl * 0.125;
  return Math.abs(mlTeoricos - mlMedidos) > tolerancia ? "revisar" : "normal";
}
