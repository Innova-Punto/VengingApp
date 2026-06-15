import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import { cerrarCierre } from "../actions";
import PesajeItemEditor from "./PesajeItemEditor";

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

  // Reporte financiero
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reporteRaw } = await (supabase as any)
    .from("vista_reporte_cierre")
    .select("*")
    .eq("cierre_id", cierre.id)
    .maybeSingle();
  const reporte = reporteRaw as
    | {
        gramos_almacen_inicio: number | null;
        valor_almacen_inicio: number | null;
        gramos_maquinas_inicio: number | null;
        valor_maquinas_inicio: number | null;
        valor_total_inicio: number;
        gramos_almacen_fin: number | null;
        valor_almacen_fin: number | null;
        gramos_maquinas_fin: number | null;
        valor_maquinas_fin: number | null;
        valor_total_fin: number;
        gramos_enviados_maquinas: number;
        valor_enviado_maquinas: number;
        gramos_devueltos: number;
        valor_devuelto: number;
        gramos_merma: number;
        valor_merma: number;
        gramos_ajuste_pesaje: number;
        valor_ajuste_pesaje: number;
        gramos_ajuste_almacen: number;
        valor_ajuste_almacen: number;
        gramos_venta_nayax: number;
        valor_venta_nayax: number;
        num_ventas_nayax: number;
        gramos_consumo_calculado: number;
        valor_consumo_calculado: number;
      }
    | null;

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

      {reporte && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Reporte financiero
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Inventario inicio
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                {fmtMxn(reporte.valor_total_inicio)}
              </div>
              <dl className="mt-2 space-y-1 text-xs text-zinc-600">
                <PairR label="Almacén" gramos={reporte.gramos_almacen_inicio} valor={reporte.valor_almacen_inicio} />
                <PairR label="Máquinas" gramos={reporte.gramos_maquinas_inicio} valor={reporte.valor_maquinas_inicio} />
              </dl>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Inventario fin {cierre.estado !== "cerrado" && (
                  <span className="text-amber-700">(provisional · cierre no cerrado)</span>
                )}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                {fmtMxn(reporte.valor_total_fin)}
              </div>
              <dl className="mt-2 space-y-1 text-xs text-zinc-600">
                <PairR label="Almacén" gramos={reporte.gramos_almacen_fin} valor={reporte.valor_almacen_fin} />
                <PairR label="Máquinas" gramos={reporte.gramos_maquinas_fin} valor={reporte.valor_maquinas_fin} />
              </dl>
            </div>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-green-900">
              Consumo real del mes (en máquinas)
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-green-900">
              {fmtMxn(reporte.valor_consumo_calculado)}
            </div>
            <div className="mt-1 text-xs text-green-800">
              {fmtG(reporte.gramos_consumo_calculado)} dispensados
            </div>
            <div className="mt-3 text-[11px] text-green-800">
              Fórmula: inv. máquinas inicio (
              {fmtG(reporte.gramos_maquinas_inicio ?? 0)}) + enviado a
              máquinas ({fmtG(reporte.gramos_enviados_maquinas)}) − inv.
              máquinas fin ({fmtG(reporte.gramos_maquinas_fin ?? 0)})
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Concepto</th>
                  <th className="px-3 py-2 text-right font-medium">Gramos</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                <FilaR label="Cartuchos enviados a máquinas (llenados)" gramos={reporte.gramos_enviados_maquinas} valor={reporte.valor_enviado_maquinas} />
                <FilaR label="Cartuchos devueltos al almacén" gramos={reporte.gramos_devueltos} valor={reporte.valor_devuelto} tono="green" />
                <FilaR label="Mermas autorizadas" gramos={reporte.gramos_merma} valor={reporte.valor_merma} tono="red" />
                <FilaR label="Ajustes por pesaje en máquina" gramos={reporte.gramos_ajuste_pesaje} valor={reporte.valor_ajuste_pesaje} />
                <FilaR label="Ajustes por conteo de almacén" gramos={reporte.gramos_ajuste_almacen} valor={reporte.valor_ajuste_almacen} />
                <FilaR
                  label={`Ventas Nayax (${reporte.num_ventas_nayax})`}
                  gramos={reporte.gramos_venta_nayax}
                  valor={reporte.valor_venta_nayax}
                  tono="green"
                />
              </tbody>
            </table>
          </div>
        </section>
      )}

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
                        {fmtCDMX(p.fecha, {
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
                              <td className="px-3 py-1 text-right">
                                <PesajeItemEditor
                                  itemId={it.id}
                                  cierreId={cierre.id}
                                  gramosMedidos={it.gramos_medidos}
                                  editable={cierre.estado !== "cerrado"}
                                />
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

      {cierre.estado !== "cerrado" && (
        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">
            Cerrar periodo
          </h2>
          <ul className="space-y-1 text-xs">
            <li
              className={
                cierre.conteo_almacen_completado
                  ? "text-green-700"
                  : "text-amber-700"
              }
            >
              {cierre.conteo_almacen_completado ? "✓" : "○"} Conteo de
              almacén aplicado
            </li>
            <li className="text-zinc-600">
              {(pesajes ?? []).length > 0 ? "✓" : "○"} {(pesajes ?? []).length}{" "}
              pesaje(s) de máquina registrados
            </li>
          </ul>
          <form action={cerrarCierre} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={cierre.id} />
            {!cierre.conteo_almacen_completado && (
              <label className="flex items-center gap-2 text-xs text-amber-800">
                <input
                  type="checkbox"
                  name="force"
                  value="1"
                  className="h-4 w-4"
                />
                Cerrar sin conteo de almacén (forzado)
              </label>
            )}
            <button
              type="submit"
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-800"
            >
              Cerrar periodo
            </button>
          </form>
          <p className="text-xs text-zinc-500">
            Al cerrar se toma snapshot de máquinas pesadas y total activas.
            En v1 el sistema no bloquea físicamente movimientos posteriores
            con fecha del mes cerrado; respétalo por proceso.
          </p>
        </section>
      )}

      {cierre.estado === "cerrado" && (
        <section className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-900">Periodo cerrado</p>
          <p className="mt-1 text-xs text-green-800">
            {cierre.maquinas_pesadas} de {cierre.total_maquinas_periodo}{" "}
            máquinas activas pesadas.
          </p>
        </section>
      )}
    </div>
  );
}

function fmtMxn(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtG(g: number | null | undefined): string {
  const v = Number(g ?? 0);
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(2)} kg`;
  return `${v} g`;
}

function PairR({
  label,
  gramos,
  valor,
}: {
  label: string;
  gramos: number | null | undefined;
  valor: number | null | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span>{label}</span>
      <span className="tabular-nums">
        {fmtG(gramos)} · <span className="font-medium">{fmtMxn(valor)}</span>
      </span>
    </div>
  );
}

function FilaR({
  label,
  gramos,
  valor,
  tono,
}: {
  label: string;
  gramos: number | null | undefined;
  valor: number | null | undefined;
  tono?: "green" | "red";
}) {
  const cls = tono === "green" ? "text-green-700" : tono === "red" ? "text-red-700" : "text-zinc-900";
  return (
    <tr>
      <td className="px-3 py-1.5 text-zinc-700">{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">{fmtG(gramos)}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${cls}`}>{fmtMxn(valor)}</td>
    </tr>
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
