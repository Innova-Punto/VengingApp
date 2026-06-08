import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMXFechaHora } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mensajes Nayax descartados · MuscleUp" };

export default async function DescartadosPage() {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const { data: rows, error } = await supabase
    .from("nayax_mensajes_descartados")
    .select(
      "id, sqs_message_id, transaction_id, machine_id, motivo, payload, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/nayax"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Nayax
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Mensajes descartados
        </h1>
        <p className="text-sm text-zinc-600">
          Mensajes SQS que llegaron con datos incompletos (típicamente sin
          PA Code) y se archivaron en lugar de quedarse reciclando en la cola.
          Aquí puedes ver el payload completo para auditar si eran ventas
          reales o solo eventos de máquina.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Archivado</th>
              <th className="px-3 py-2 font-medium">Transaction ID</th>
              <th className="px-3 py-2 font-medium">Machine ID</th>
              <th className="px-3 py-2 font-medium">Motivo</th>
              <th className="px-3 py-2 font-medium">Payload (JSON)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 text-xs text-zinc-600">
                  {fmtCDMXFechaHora(r.created_at)}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.transaction_id ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.machine_id ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs">{r.motivo}</td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-xs text-blue-700 hover:underline">
                      Ver payload
                    </summary>
                    <pre className="mt-2 max-h-80 overflow-auto rounded bg-zinc-50 p-2 text-[10px] leading-snug text-zinc-700">
                      {JSON.stringify(r.payload, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-zinc-500"
                >
                  No hay mensajes descartados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
