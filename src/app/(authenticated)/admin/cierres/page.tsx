import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { abrirCierre } from "./actions";

export const metadata = { title: "Cierres mensuales · MuscleUp" };

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

export default async function CierresPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const { data: cierres } = await supabase
    .from("cierres_mensuales")
    .select(
      `id, periodo_mes, periodo_anio, estado, fecha_inicio_cierre,
       fecha_cierre, maquinas_pesadas, total_maquinas_periodo,
       conteo_almacen_completado`,
    )
    .order("periodo_anio", { ascending: false })
    .order("periodo_mes", { ascending: false });

  const hoy = new Date();
  const mesActual = hoy.getMonth() + 1;
  const anioActual = hoy.getFullYear();

  const yaExisteActual = (cierres ?? []).some(
    (c) => c.periodo_mes === mesActual && c.periodo_anio === anioActual,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cierres mensuales
        </h1>
        <p className="text-sm text-zinc-600">
          Para pesar máquinas, hacer conteos de almacén y cerrar el periodo
          contable. Solo puede haber un cierre activo a la vez para que los
          operadores sepan a dónde atar sus pesajes.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(searchParams.error)}
        </p>
      )}

      <form
        action={abrirCierre}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Mes
          </label>
          <select
            name="mes"
            defaultValue={mesActual}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            {MESES.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Año
          </label>
          <input
            type="number"
            name="anio"
            defaultValue={anioActual}
            min={2024}
            max={2100}
            className="mt-1 w-24 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
        >
          {yaExisteActual ? "Ir al cierre actual" : "Abrir cierre"}
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Período</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Abierto</th>
              <th className="px-3 py-2 font-medium">Cerrado</th>
              <th className="px-3 py-2 text-right font-medium">
                Máquinas pesadas
              </th>
              <th className="px-3 py-2 font-medium">Conteo almacén</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(cierres ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-zinc-50">
                <td className="px-3 py-2 font-medium">
                  <Link
                    href={`/admin/cierres/${c.id}`}
                    className="hover:underline"
                  >
                    {MESES[c.periodo_mes - 1]} {c.periodo_anio}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      ESTADO_BADGE[c.estado] ?? "bg-zinc-100"
                    }`}
                  >
                    {c.estado.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">
                  {c.fecha_inicio_cierre
                    ? new Date(c.fecha_inicio_cierre).toLocaleDateString(
                        "es-MX",
                      )
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">
                  {c.fecha_cierre
                    ? new Date(c.fecha_cierre).toLocaleDateString("es-MX")
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.maquinas_pesadas} /{" "}
                  {c.total_maquinas_periodo ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.conteo_almacen_completado ? (
                    <span className="text-green-700">✓ Completado</span>
                  ) : (
                    <span className="text-zinc-400">Pendiente</span>
                  )}
                </td>
              </tr>
            ))}
            {(cierres ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-zinc-500"
                >
                  No hay cierres todavía. Abre el primer mes para comenzar a
                  pesar máquinas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
