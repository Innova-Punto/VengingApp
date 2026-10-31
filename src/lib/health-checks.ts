import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Un renglón de `v_health_checks`, tal como lo guarda el snapshot diario. */
export type HealthCheck = {
  id: string;
  titulo: string;
  descripcion: string;
  conteo: number;
  severidad: "ok" | "advertencia" | "critico";
  categoria: string;
};

export type ResumenSalud = {
  criticos: HealthCheck[];
  /** Cuándo se tomó el snapshot. Null si nunca ha corrido. */
  ejecutadoAt: string | null;
};

/**
 * Los chequeos críticos de la última corrida, para la franja del layout.
 *
 * Lee el **snapshot**, no la vista viva. `v_health_checks` son catorce
 * agregados sobre tolvas, ventas y movimientos: ~200 ms hoy y creciendo. El
 * layout corre en cada pantalla de la app, así que pegarle en vivo sería
 * cobrarle ese cuarto de segundo a todas las navegaciones del día para un dato
 * que cambia despacio. El cron lo calcula cada hora (vercel.json) y aquí solo
 * se lee un renglón por índice.
 *
 * Eso implica que la franja puede ir hasta una hora atrasada, y por eso enseña
 * la hora del corte: un aviso que finge ser de este segundo es peor que uno
 * que dice desde cuándo sabe lo que sabe.
 *
 * Nunca lanza. Si la consulta falla, la franja simplemente no aparece: que se
 * caiga toda la app porque no se pudo pintar un aviso sería el remedio peor
 * que la enfermedad.
 */
export async function criticosDeSalud(): Promise<ResumenSalud> {
  const vacio: ResumenSalud = { criticos: [], ejecutadoAt: null };

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("health_check_runs")
      .select("ejecutado_at, detalles")
      .order("ejecutado_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return vacio;

    const detalles = (data.detalles ?? []) as HealthCheck[];
    if (!Array.isArray(detalles)) return vacio;

    return {
      criticos: detalles
        .filter((c) => c?.severidad === "critico" && (c.conteo ?? 0) > 0)
        // Primero integridad: son los que significan que un número está mal,
        // no que falte configurar algo. Dentro de cada grupo, el más grande.
        .sort((a, b) => {
          const peso = (c: HealthCheck) => (c.categoria === "integridad" ? 0 : 1);
          return peso(a) - peso(b) || (b.conteo ?? 0) - (a.conteo ?? 0);
        }),
      ejecutadoAt: data.ejecutado_at ?? null,
    };
  } catch {
    return vacio;
  }
}
