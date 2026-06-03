/**
 * Helpers de fecha/hora en timezone CDMX.
 *
 * Vercel corre en UTC. Para que los usuarios vean fechas y horas en hora
 * local de la operación (CDMX), todos los formatos pasan por aquí.
 */

export const CDMX_TZ = "America/Mexico_City";

/** Formatea una fecha en hora CDMX con las opciones dadas. */
export function fmtCDMX(
  d: Date | string | number,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString("es-MX", { timeZone: CDMX_TZ, ...options });
}

/** Fecha + hora corta (ej. "03 jun, 14:32") en CDMX */
export function fmtCDMXFechaHora(d: Date | string): string {
  return fmtCDMX(d, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Solo fecha corta (ej. "03 jun") en CDMX */
export function fmtCDMXFechaCorta(d: Date | string): string {
  return fmtCDMX(d, { day: "2-digit", month: "short" });
}

/** Fecha larga (ej. "lun 03 jun") en CDMX */
export function fmtCDMXFechaLarga(d: Date | string): string {
  return fmtCDMX(d, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

/** YYYY-MM-DD según el calendario CDMX. */
export function isoFechaCDMX(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: CDMX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

/**
 * Date que representa medianoche CDMX de hoy (en UTC).
 * CDMX desde 2022 no observa DST → siempre UTC-6.
 */
export function startOfTodayCDMX(): Date {
  return new Date(`${isoFechaCDMX(new Date())}T00:00:00-06:00`);
}

/** Date de hace N días desde medianoche CDMX. */
export function startOfNDaysAgoCDMX(n: number): Date {
  const t = startOfTodayCDMX();
  t.setUTCDate(t.getUTCDate() - n);
  return t;
}
