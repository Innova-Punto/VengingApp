/**
 * Agua: helpers compartidos entre campo, almacén y planeación.
 *
 * Todo se maneja en **mililitros enteros**, igual que los polvos en gramos.
 * Una pieza de agua son 10 L; un tanque de máquina, 50 L; una bebida, 300 ml.
 */

/**
 * Litros por pieza de agua. El valor vigente vive en
 * `config_global.agua_ml_por_garrafon`.
 *
 * Bajó de 20 L a 10 L en oct-2026: por precio se empezó a comprar en
 * presentación de 10 L. **El inventario cuenta piezas, no litros**, así que
 * este número es la única traducción entre una cosa y la otra.
 *
 * Eso implica un supuesto que hay que respetar: **todo el inventario de agua
 * es de la misma presentación.** El día que convivan piezas de 10 L y de 20 L,
 * este número deja de ser cierto para la mitad del almacén y las cuentas se
 * van a ir sin que nadie lo note. Si eso llega a pasar, lo que toca es llevar
 * el inventario en mililitros —como ya se hace con el polvo en gramos y con el
 * agua dentro de la máquina— y no seguir moviendo esta constante.
 */
export const ML_POR_GARRAFON = 10_000;

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
 * Cuántos litros conviene que el operador compre en la tienda camino a una
 * máquina, para dejarla llena.
 *
 * Se redondea hacia abajo a múltiplos de 10 L porque así se vende el agua, y
 * porque el nivel de partida es un estimado: el tanque es transparente pero no
 * tiene escala, y el operador lo reporta por cuartos. Sugerir "37 L" fingiría
 * una precisión que el dato no tiene.
 *
 * Devuelve null cuando no hay nada que comprar o cuando nunca se ha medido —
 * ahí lo honesto es que mida primero, no que cargue agua a ciegas.
 */
export function litrosASugerir(
  mlEstimado: number | null | undefined,
  capacidadMl: number | null | undefined,
  sinMedicion: boolean | null | undefined,
): number | null {
  if (sinMedicion) return null;
  if (mlEstimado == null || !capacidadMl) return null;
  const faltanL = (capacidadMl - mlEstimado) / 1000;
  if (faltanL < 10) return null;
  return Math.floor(faltanL / 10) * 10;
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
