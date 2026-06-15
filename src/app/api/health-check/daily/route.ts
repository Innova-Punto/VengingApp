import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;
export const maxDuration = 30;

/**
 * Cron diario que captura un snapshot de v_health_checks en
 * health_check_runs. Se invoca por Vercel Cron (vercel.json).
 *
 * También se puede invocar manualmente con ?manual=1 para correr on-demand.
 */
export async function GET(req: Request) {
  noStore();
  const supabase = createAdminClient();

  const url = new URL(req.url);
  const fuente = url.searchParams.get("manual") === "1" ? "manual" : "cron";

  const { data: checks, error } = await supabase
    .from("v_health_checks")
    .select("*");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const rows = checks ?? [];
  const ok_count = rows.filter((r) => r.severidad === "ok").length;
  const warn_count = rows.filter((r) => r.severidad === "advertencia").length;
  const critical_count = rows.filter((r) => r.severidad === "critico").length;

  const { error: insErr } = await supabase
    .from("health_check_runs")
    .insert({
      total_checks: rows.length,
      ok_count,
      warn_count,
      critical_count,
      detalles: rows,
      fuente,
    });

  if (insErr) {
    return NextResponse.json(
      { ok: false, error: `insert: ${insErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    fuente,
    total: rows.length,
    ok_count,
    warn_count,
    critical_count,
    issues: rows.filter((r) => r.severidad !== "ok"),
  });
}
