/**
 * Calcula la urgencia de visita de una máquina basado en su última visita
 * real (check_out legítimo, no forzado por cierre parcial). Devuelve
 * etiqueta, color de badge y días transcurridos.
 *
 * Umbrales:
 *   - 0–3 días → verde "Reciente"
 *   - 4–5 días → amarillo "Atención"
 *   - 6–7 días → naranja "Urgente"
 *   - 8+ días o nunca visitada → rojo "Crítico"
 */

export type UrgenciaVisita = {
  diasSinVisita: number | null;
  label: string;
  badgeClass: string;
  textoCorto: string;
};

export function urgenciaUltimaVisita(
  ultimaVisitaAt: string | null | undefined,
): UrgenciaVisita {
  if (!ultimaVisitaAt) {
    return {
      diasSinVisita: null,
      label: "Crítico",
      badgeClass: "bg-red-100 text-red-700",
      textoCorto: "Nunca",
    };
  }

  const ms = Date.now() - new Date(ultimaVisitaAt).getTime();
  const dias = Math.floor(ms / (1000 * 60 * 60 * 24));

  if (dias <= 3) {
    return {
      diasSinVisita: dias,
      label: "Reciente",
      badgeClass: "bg-green-100 text-green-700",
      textoCorto: dias === 0 ? "Hoy" : `${dias}d`,
    };
  }
  if (dias <= 5) {
    return {
      diasSinVisita: dias,
      label: "Atención",
      badgeClass: "bg-yellow-100 text-yellow-800",
      textoCorto: `${dias}d`,
    };
  }
  if (dias <= 7) {
    return {
      diasSinVisita: dias,
      label: "Urgente",
      badgeClass: "bg-orange-100 text-orange-700",
      textoCorto: `${dias}d`,
    };
  }
  return {
    diasSinVisita: dias,
    label: "Crítico",
    badgeClass: "bg-red-100 text-red-700",
    textoCorto: `${dias}d`,
  };
}
