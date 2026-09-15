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
 * **El cron está apagado a propósito** (decisión de dirección, sep-2026): el
 * agente arranca solo con el botón de la pantalla de planeación, hasta ver un
 * par de propuestas y decidir si vale la pena que corra solo. Para encenderlo,
 * basta con devolver esta entrada a `vercel.json`:
 *
 *   { "path": "/api/ruteo/generar", "schedule": "0 12 * * *" }   // 6:00 CDMX
 *
 * Este endpoint queda listo y protegido con CRON_SECRET; mientras tanto sirve
 * para dispararlo a mano desde fuera si hiciera falta.
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
