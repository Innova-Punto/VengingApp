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

/**
 * Medianoche CDMX del día 1 del mes, corrido `offsetMeses` hacia atrás.
 *
 * El mes se calcula sobre el calendario **CDMX**, no sobre el del servidor:
 * el 1 de cada mes, entre las 00:00 y las 06:00 hora de México, en UTC ya es
 * día 1 también, pero el último día del mes a las 19:00 CDMX en UTC ya es el
 * día 1 del mes siguiente. Partir del reloj de Vercel haría que esa tarde el
 * reporte cambiara de mes seis horas antes de tiempo.
 *
 * `Date.UTC` normaliza el desbordamiento solo: pedir el mes -1 de enero
 * devuelve diciembre del año anterior sin que haya que tratar el caso aparte.
 */
export function startOfMonthCDMX(offsetMeses = 0): Date {
  const [anio, mes] = isoFechaCDMX(new Date()).split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 1 - offsetMeses, 1));
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return new Date(`${d.getUTCFullYear()}-${mm}-01T00:00:00-06:00`);
}

/** Nombre del mes de una fecha, en CDMX (ej. "noviembre"). */
export function nombreMesCDMX(d: Date): string {
  return fmtCDMX(d, { month: "long" });
}
