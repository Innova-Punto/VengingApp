import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Surtidos · Innovaypunto" };

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-blue-100 text-blue-700",
  en_proceso: "bg-amber-100 text-amber-700",
  completado: "bg-green-100 text-green-700",
};

type SearchParams = { fecha?: string };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function SurtidosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "planeador", "almacen");

  const fecha = (searchParams.fecha ?? todayISO()).slice(0, 10);

  const supabase = createClient();
  const { data: surtidos, error } = await supabase
    .from("surtidos")
    .select(
      `id, folio, fecha, estado,
       asignacion:asignaciones_diarias!surtidos_asignacion_id_fkey(
         id, fecha,
         ruta:rutas(nombre, color_hex),
         operador:profiles!asignaciones_diarias_operador_id_fkey(full_name)
       ),
       items:surtido_items(id, cartuchos_entregados, vasos_entregados)`,
    )
    .order("fecha", { ascending: false })
    .limit(100);

  // Filtrar por fecha de la asignación si se pasó
  const filtrados = (surtidos ?? []).filter((s) => {
    const a = Array.isArray(s.asignacion) ? s.asignacion[0] : s.asignacion;
    return a && a.fecha === fecha;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Surtidos</h1>
        <p className="text-sm text-zinc-600">
          Paquetes preparados por almacén para cada asignación. Cada surtido
          descuenta cartuchos y vasos del inventario al marcarse completado.
        </p>
      </div>

      <form
        method="get"
        className="flex items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Fecha asignación
          </label>
          <input
            type="date"
            name="fecha"
            defaultValue={fecha}
            className="mt-1 w-44 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Filtrar
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Error: {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium w-8"></th>
              <th className="px-4 py-2 font-medium">Folio</th>
              <th className="px-4 py-2 font-medium">Ruta</th>
              <th className="px-4 py-2 font-medium">Operador</th>
              <th className="px-4 py-2 text-right font-medium">Items</th>
              <th className="px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtrados.map((s) => {
              const a = Array.isArray(s.asignacion)
                ? s.asignacion[0]
                : s.asignacion;
              const ruta = a
                ? Array.isArray(a.ruta)
                  ? a.ruta[0]
                  : a.ruta
                : null;
              const op = a
                ? Array.isArray(a.operador)
                  ? a.operador[0]
                  : a.operador
                : null;
              const itemsCount = Array.isArray(s.items) ? s.items.length : 0;
              return (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2">
                    <div
                      className="h-6 w-2 rounded-sm"
                      style={{
                        backgroundColor: ruta?.color_hex ?? "#a1a1aa",
                      }}
                    />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs font-medium">
                    <Link
                      href={`/planeacion/surtidos/${s.id}`}
                      className="hover:underline"
                    >
                      {s.folio}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-700">
                    {ruta?.nombre ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-zinc-700">
                    {op?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {itemsCount}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        ESTADO_BADGE[s.estado] ?? "bg-zinc-100"
                      }`}
                    >
                      {s.estado}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No hay surtidos para esta fecha. Genera uno desde el
                  detalle de una asignación planeada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
