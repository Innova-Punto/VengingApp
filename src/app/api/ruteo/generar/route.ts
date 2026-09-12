import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";

import { correrPropuesta } from "@/lib/ruteo/correr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;
// El modelo se toma su tiempo con 72 máquinas; 8 h de jornada que planear no
// se resuelven en 10 segundos.
export const maxDuration = 300;

/**
 * Corrida del agente de ruteo.
 *
 * La dispara el cron de Vercel a las 6:00 CDMX (12:00 UTC) para que la
 * propuesta esté lista antes de que llegue cualquiera. El botón de la pantalla
 * de planeación llama a la Server Action, no a este endpoint.
 */
export async function GET(request: Request) {
  noStore();

  // Mismo patrón que el resto de los crons: Vercel manda el secreto.
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const r = await correrPropuesta({ fuente: "cron" });
    return NextResponse.json({
      ok: true,
      propuesta_id: r.propuestaId,
      rutas: r.plan.length,
      paradas: r.plan.reduce((s, p) => s + p.paradas.length, 0),
      recortadas: r.plan.reduce((s, p) => s + p.recortadas.length, 0),
      descartes: r.descartes,
      costo_usd: r.costoUsd,
      duracion_ms: r.duracionMs,
    });
  } catch (e) {
    // El error ya quedó guardado en propuestas_ruteo; aquí solo se reporta.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
