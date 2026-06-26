import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Health check · Innovaypunto" };
export const dynamic = "force-dynamic";

type Check = {
  id: string;
  titulo: string;
  descripcion: string;
  conteo: number;
  severidad: "ok" | "advertencia" | "critico";
  categoria: string;
};

const SEVERITY_RANK = { critico: 0, advertencia: 1, ok: 2 } as const;

const BADGE: Record<Check["severidad"], string> = {
  critico: "bg-red-100 text-red-700",
  advertencia: "bg-amber-100 text-amber-700",
  ok: "bg-green-100 text-green-700",
};
const LABEL: Record<Check["severidad"], string> = {
  critico: "CRÍTICO",
  advertencia: "ADVERTENCIA",
  ok: "OK",
};

export default async function HealthCheckPage() {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const [{ data: checks }, { data: ultimoRun }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("v_health_checks").select("*"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("health_check_runs")
      .select("id, ejecutado_at, ok_count, warn_count, critical_count, fuente")
      .order("ejecutado_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows: Check[] = (checks ?? []) as Check[];
  rows.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severidad];
    const sb = SEVERITY_RANK[b.severidad];
    if (sa !== sb) return sa - sb;
    return a.categoria.localeCompare(b.categoria);
  });

  const ok = rows.filter((r) => r.severidad === "ok").length;
  const warn = rows.filter((r) => r.severidad === "advertencia").length;
  const crit = rows.filter((r) => r.severidad === "critico").length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/supervision"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Dashboard supervisión
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Health check
        </h1>
        <p className="text-sm text-zinc-600">
          Validaciones que se corren en tiempo real. El cron diario captura
          un snapshot a las 7:00 CDMX. Esta página siempre muestra el estado
          actual.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat
          label="OK"
          value={ok}
          tone={ok === rows.length ? "green" : "zinc"}
        />
        <Stat
          label="Advertencias"
          value={warn}
          tone={warn > 0 ? "amber" : "zinc"}
        />
        <Stat
          label="Críticos"
          value={crit}
          tone={crit > 0 ? "red" : "zinc"}
        />
        <Stat label="Total" value={rows.length} tone="zinc" />
      </section>

      {ultimoRun && (
        <p className="text-xs text-zinc-500">
          Último snapshot guardado:{" "}
          {fmtCDMX(ultimoRun.ejecutado_at, {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          ({ultimoRun.fuente}) · {ultimoRun.ok_count} ok ·{" "}
          {ultimoRun.warn_count} advertencias · {ultimoRun.critical_count}{" "}
          críticos
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Check</th>
              <th className="px-3 py-2 font-medium">Categoría</th>
              <th className="px-3 py-2 text-right font-medium">Conteo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.id} className="align-top hover:bg-zinc-50">
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[r.severidad]}`}
                  >
                    {LABEL[r.severidad]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-zinc-900">{r.titulo}</div>
                  <div className="text-xs text-zinc-600">{r.descripcion}</div>
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">
                  {r.categoria}
                </td>
                <td className="px-3 py-2 text-right text-base font-semibold tabular-nums">
                  {r.conteo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "amber" | "red" | "zinc";
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "red"
          ? "text-red-700"
          : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
