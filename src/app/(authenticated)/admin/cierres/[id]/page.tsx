import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const ESTADO_BADGE: Record<string, string> = {
  abierto: "bg-blue-100 text-blue-700",
  en_proceso: "bg-amber-100 text-amber-700",
  cerrado: "bg-green-100 text-green-700",
};

export default async function CierreDetallePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const { data: cierre } = await supabase
    .from("cierres_mensuales")
    .select(
      `id, periodo_mes, periodo_anio, estado,
       fecha_inicio_cierre, fecha_cierre, maquinas_pesadas,
       total_maquinas_periodo, conteo_almacen_completado, notas`,
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!cierre) notFound();

  const { data: pesajes } = await supabase
    .from("pesajes_maquina")
    .select(
      `id, fecha,
       maquina:maquinas(serie, alias),
       operador:profiles!pesajes_maquina_operador_id_fkey(full_name),
       items:pesaje_tolva_items(
         id, gramos_medidos, gramos_teoricos, diferencia_gramos,
         diferencia_porcentaje, valor_diferencia, alerta_generada,
         tolva:tolvas(numero, producto:productos(sku, nombre))
       )`,
    )
    .eq("cierre_id", cierre.id)
    .order("fecha", { ascending: false });

  // Stats agregados
  let totalDiferenciaG = 0;
  let totalValorDiferencia = 0;
  let totalAlertas = 0;
  let totalItems = 0;
  for (const p of pesajes ?? []) {
    const items = Array.isArray(p.items) ? p.items : [];
    for (const it of items) {
      totalDiferenciaG += it.diferencia_gramos ?? 0;
      totalValorDiferencia += Number(it.valor_diferencia ?? 0);
      if (it.alerta_generada) totalAlertas += 1;
      totalItems += 1;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/cierres"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Cierres
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {MESES[cierre.periodo_mes - 1]} {cierre.periodo_anio}
          </h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              ESTADO_BADGE[cierre.estado] ?? "bg-zinc-100"
            }`}
          >
            {cierre.estado.replace(/_/g, " ")}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          Abierto:{" "}
          {cierre.fecha_inicio_cierre
            ? new Date(cierre.fecha_inicio_cierre).toLocaleDateString("es-MX")
            : "—"}
          {cierre.fecha_cierre && (
            <>
              {" · "}Cerrado:{" "}
              {new Date(cierre.fecha_cierre).toLocaleDateString("es-MX")}
            </>
          )}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Tolvas pesadas"
          value={String(totalItems)}
          hint={`${(pesajes ?? []).length} pesajes`}
        />
        <Stat
          label="Diferencia total"
          value={`${totalDiferenciaG.toLocaleString("es-MX")}g`}
          tone={totalDiferenciaG < 0 ? "red" : totalDiferenciaG > 0 ? "amber" : "zinc"}
        />
        <Stat
          label="Valor diferencia"
          value={`$${totalValorDiferencia.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          tone={totalValorDiferencia < 0 ? "red" : totalValorDiferencia > 0 ? "amber" : "zinc"}
        />
        <Stat
          label="Alertas (≥5%)"
          value={String(totalAlertas)}
          tone={totalAlertas > 0 ? "red" : "zinc"}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Pesajes del periodo
        </h2>
        {(pesajes ?? []).length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
            Aún no hay pesajes. Cuando los operadores pasen por las máquinas
            y registren peso, aparecerán aquí.
          </div>
        ) : (
          <div className="space-y-3">
            {(pesajes ?? []).map((p) => {
              const maq = Array.isArray(p.maquina) ? p.maquina[0] : p.maquina;
              const op = Array.isArray(p.operador)
                ? p.operador[0]
                : p.operador;
              const items = Array.isArray(p.items) ? p.items : [];
              return (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
                >
                  <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                    <div>
                      <div className="font-mono text-sm font-semibold">
                        {maq?.serie ?? "—"}
                      </div>
                      {maq?.alias && (
                        <div className="text-xs text-zinc-600">
                          {maq.alias}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-zinc-600">
                      <div>{op?.full_name}</div>
                      <div>
                        {new Date(p.fecha).toLocaleString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </header>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-3 py-1 font-medium">Tolva</th>
                        <th className="px-3 py-1 font-medium">Producto</th>
                        <th className="px-3 py-1 text-right font-medium">
                          Teórico
                        </th>
                        <th className="px-3 py-1 text-right font-medium">
                          Medido
                        </th>
                        <th className="px-3 py-1 text-right font-medium">
                          Dif.
                        </th>
                        <th className="px-3 py-1 text-right font-medium">
                          %
                        </th>
                        <th className="px-3 py-1 text-right font-medium">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {items.map(
                        (it: {
                          id: string;
                          gramos_medidos: number;
                          gramos_teoricos: number;
                          diferencia_gramos: number | null;
                          diferencia_porcentaje: number | null;
                          valor_diferencia: number | null;
                          alerta_generada: boolean;
                          tolva: {
                            numero: number;
                            producto: { sku: string; nombre: string } | null;
                          } | { numero: number; producto: { sku: string; nombre: string } | null }[] | null;
                        }) => {
                          const t = Array.isArray(it.tolva)
                            ? it.tolva[0]
                            : it.tolva;
                          const prod = t?.producto
                            ? Array.isArray(t.producto)
                              ? t.producto[0]
                              : t.producto
                            : null;
                          const dif = it.diferencia_gramos ?? 0;
                          const tone =
                            dif < 0
                              ? "text-red-700"
                              : dif > 0
                                ? "text-amber-700"
                                : "text-zinc-700";
                          return (
                            <tr
                              key={it.id}
                              className={
                                it.alerta_generada ? "bg-red-50" : undefined
                              }
                            >
                              <td className="px-3 py-1 font-mono">
                                #{t?.numero ?? "?"}
                              </td>
                              <td className="px-3 py-1">
                                {prod?.nombre ?? "—"}
                                <div className="font-mono text-[10px] text-zinc-500">
                                  {prod?.sku ?? ""}
                                </div>
                              </td>
                              <td className="px-3 py-1 text-right tabular-nums">
                                {it.gramos_teoricos}g
                              </td>
                              <td className="px-3 py-1 text-right tabular-nums">
                                {it.gramos_medidos}g
                              </td>
                              <td
                                className={`px-3 py-1 text-right tabular-nums font-medium ${tone}`}
                              >
                                {dif > 0 ? "+" : ""}
                                {dif}g
                              </td>
                              <td
                                className={`px-3 py-1 text-right tabular-nums ${tone}`}
                              >
                                {it.diferencia_porcentaje != null
                                  ? `${it.diferencia_porcentaje > 0 ? "+" : ""}${it.diferencia_porcentaje}%`
                                  : "—"}
                              </td>
                              <td
                                className={`px-3 py-1 text-right tabular-nums ${tone}`}
                              >
                                $
                                {Number(it.valor_diferencia ?? 0).toLocaleString(
                                  "es-MX",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">Pendiente del cierre</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-600">
          <li>Conteo físico de cartuchos y granel en almacén.</li>
          <li>Marcar cierre como cerrado (snapshot final).</li>
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "red" | "amber" | "zinc";
}) {
  const color =
    tone === "red"
      ? "text-red-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] text-zinc-500">{hint}</div>}
    </div>
  );
}
