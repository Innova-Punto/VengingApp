export const MOTIVOS = [
  { value: "omision_carga", label: "Omisión en carga" },
  { value: "omision_llenado", label: "Omisión de llenado" },
  { value: "no_registro_visita", label: "No registró visita" },
  { value: "llegada_tarde", label: "Llegada tarde" },
  { value: "carga_destiempo", label: "Carga a destiempo" },
  {
    value: "maquina_error_post_visita",
    label: "Máquina en error después de visita",
  },
] as const;

export type MotivoValue = (typeof MOTIVOS)[number]["value"];

export const MOTIVO_LABEL: Record<MotivoValue, string> = Object.fromEntries(
  MOTIVOS.map((m) => [m.value, m.label]),
) as Record<MotivoValue, string>;

export const ESTADOS = [
  { value: "abierto", label: "Abierto" },
  { value: "resuelto", label: "Resuelto" },
  { value: "descartado", label: "Descartado" },
] as const;

export type EstadoValue = (typeof ESTADOS)[number]["value"];

export const ESTADO_LABEL: Record<EstadoValue, string> = Object.fromEntries(
  ESTADOS.map((e) => [e.value, e.label]),
) as Record<EstadoValue, string>;

export const ESTADO_BADGE: Record<EstadoValue, string> = {
  abierto: "bg-amber-100 text-amber-700",
  resuelto: "bg-green-100 text-green-700",
  descartado: "bg-zinc-100 text-zinc-600",
};
