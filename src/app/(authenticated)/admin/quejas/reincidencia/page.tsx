import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Reincidencia de quejas · Innovaypunto" };

export default async function ReincidenciaPage() {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const [{ data: reincidentes }, { data: sinVenta }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("v_quejas_reincidencia")
      .select("*")
      .order("quejas_90d", { ascending: false })
      .limit(50),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("v_quejas_sin_venta")
      .select("*")
      .order("fecha_reporte", { ascending: false })
      .limit(50),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sinRespaldo = ((sinVenta ?? []) as any[]).filter(
    (r) => Number(r.ventas_en_ventana) === 0,
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/quejas" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Quejas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Reincidencia y quejas sin respaldo
        </h1>
        <p className="text-sm text-zinc-600">
          Reincidir no es defraudar. Quien compra diario en una máquina
          descompuesta se queja legítimamente varias veces — por eso el cruce
          contra ventas manda sobre el conteo.
        </p>
      </div>

      {/* ── Sin respaldo de venta ────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Reclama un cargo que no existe
          </h2>
          <p className="text-sm text-zinc-600">
            Quejas de cobro sin ninguna venta en Nayax de esa máquina en ±2 h.
            Si no hubo venta, no hubo cargo. Es la señal objetiva.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Folio</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">WhatsApp</th>
                <th className="px-4 py-2 font-medium">Máquina</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 text-right font-medium">Reclama</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sinRespaldo.map((r) => (
                <tr key={r.queja_id} className="bg-red-50/40 hover:bg-red-50">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/admin/quejas/${r.queja_id}`} className="hover:underline">
                      {r.folio}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-600">
                    {fmtCDMX(r.fecha_reporte, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">···{r.telefono_ultimos4}</td>
                  <td className="px-4 py-2 text-xs">
                    <span className="font-mono">{r.serie}</span>{" "}
                    <span className="text-zinc-500">{r.alias}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-700">{r.tipo}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">
                    {r.monto_reclamado != null
                      ? `$${Number(r.monto_reclamado).toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              ))}
              {sinRespaldo.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                    Todas las quejas de cobro abiertas tienen una venta que las
                    respalda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Reincidencia ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            WhatsApp con más de una queja en 90 días
          </h2>
          <p className="text-sm text-zinc-600">
            La columna que discrimina es <strong>máquinas distintas</strong>:
            varias quejas de la misma máquina apuntan a la máquina; varias de
            máquinas diferentes apuntan al usuario.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">WhatsApp</th>
                <th className="px-4 py-2 text-right font-medium">Quejas</th>
                <th className="px-4 py-2 text-right font-medium">Máquinas distintas</th>
                <th className="px-4 py-2 text-right font-medium">Pagado</th>
                <th className="px-4 py-2 text-right font-medium">% no procede</th>
                <th className="px-4 py-2 font-medium">Última</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {((reincidentes ?? []) as any[]).map((r) => {
                const sospechoso = Number(r.maquinas_distintas) >= 3;
                return (
                  <tr
                    key={r.telefono_hash}
                    className={sospechoso ? "bg-amber-50/60" : "hover:bg-zinc-50"}
                  >
                    <td className="px-4 py-2 font-mono text-xs">
                      ···{r.telefono_ultimos4}
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums">
                      {r.quejas_90d}
                    </td>
                    <td
                      className={`px-4 py-2 text-right text-xs tabular-nums ${
                        sospechoso ? "font-semibold text-amber-800" : ""
                      }`}
                    >
                      {r.maquinas_distintas}
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums">
                      ${Number(r.monto_pagado_90d ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums">
                      {r.pct_no_procede != null ? `${r.pct_no_procede}%` : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-600">
                      {fmtCDMX(r.ultima, { day: "2-digit", month: "short" })}
                    </td>
                  </tr>
                );
              })}
              {(reincidentes ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                    Ningún WhatsApp repite queja en los últimos 90 días.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
