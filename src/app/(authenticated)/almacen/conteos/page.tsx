import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { iniciarConteo } from "./actions";

export const metadata = { title: "Conteos de almacén · MuscleUp" };

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

export default async function ConteosPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireRole("admin", "direccion", "almacen");
  const supabase = createClient();

  const { data: conteos } = await supabase
    .from("conteos_almacen")
    .select(
      `id, fecha, estado,
       cierre:cierres_mensuales!conteos_almacen_cierre_id_fkey(
         periodo_mes, periodo_anio
       ),
       realizado_por_user:profiles!conteos_almacen_realizado_por_fkey(full_name)`,
    )
    .order("fecha", { ascending: false })
    .limit(50);

  const { data: cierresActivos } = await supabase
    .from("cierres_mensuales")
    .select("id, periodo_mes, periodo_anio")
    .in("estado", ["abierto", "en_proceso"])
    .order("periodo_anio", { ascending: false })
    .order("periodo_mes", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Conteos de almacén
        </h1>
        <p className="text-sm text-zinc-600">
          Conteo físico de cartuchos y granel disponible. Se ata a un cierre
          mensual activo y al aplicarlo ajusta inventario con kardex.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(searchParams.error)}
        </p>
      )}

      {(cierresActivos ?? []).length > 0 ? (
        <form
          action={iniciarConteo}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Cierre activo
            </label>
            <select
              name="cierre_id"
              defaultValue={cierresActivos?.[0]?.id}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
            >
              {cierresActivos?.map((c) => (
                <option key={c.id} value={c.id}>
                  {MESES[c.periodo_mes - 1]} {c.periodo_anio}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
          >
            Iniciar conteo
          </button>
          <p className="text-xs text-zinc-500">
            Al iniciar, se pre-llena con todos los lotes y encartuchados con
            stock actual.
          </p>
        </form>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No hay cierre mensual abierto.{" "}
          <Link
            href="/admin/cierres"
            className="font-medium underline"
          >
            Pide a dirección que abra uno
          </Link>
          .
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Cierre</th>
              <th className="px-3 py-2 font-medium">Realizado por</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(conteos ?? []).map((c) => {
              const cierre = Array.isArray(c.cierre) ? c.cierre[0] : c.cierre;
              const rb = Array.isArray(c.realizado_por_user)
                ? c.realizado_por_user[0]
                : c.realizado_por_user;
              return (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-2 text-xs">
                    <Link
                      href={`/almacen/conteos/${c.id}`}
                      className="hover:underline"
                    >
                      {new Date(c.fecha).toLocaleString("es-MX", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {cierre
                      ? `${MESES[cierre.periodo_mes - 1]} ${cierre.periodo_anio}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {rb?.full_name ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.estado === "aplicado"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {c.estado}
                    </span>
                  </td>
                </tr>
              );
            })}
            {(conteos ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-sm text-zinc-500"
                >
                  Aún no hay conteos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
