import { createClient } from "@/lib/supabase/server";

/** Umbral de horas sin vender (en horario de operación) para marcar revisión. */
export const UMBRAL_HORAS = 12;

export type MaquinaRevisar = {
  maquina_id: string;
  alias: string | null;
  serie: string | null;
  ubicacion: string | null;
  horas: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function filtrarRevisar(filas: any[]): MaquinaRevisar[] {
  return (filas ?? [])
    .filter(
      (f) => f.abierta_ahora && Number(f.horas_op_sin_venta) >= UMBRAL_HORAS,
    )
    .map((f) => ({
      maquina_id: f.maquina_id,
      alias: f.alias,
      serie: f.serie,
      ubicacion: f.ubicacion,
      horas: Number(f.horas_op_sin_venta),
    }))
    .sort((a, b) => b.horas - a.horas);
}

/**
 * Máquinas que requieren revisión: sin vender ≥ UMBRAL_HORAS en horario de
 * operación. Consulta el reporte y filtra. Uso en páginas que solo quieren el
 * banner (p. ej. Asignaciones).
 */
export async function getMaquinasRevisar(): Promise<MaquinaRevisar[]> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc("reporte_ventas_maquinas");
  return filtrarRevisar((data as unknown[]) ?? []);
}
