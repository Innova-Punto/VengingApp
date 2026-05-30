import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Órdenes de compra · MuscleUp" };

const ESTADO_BADGE: Record<string, string> = {
  borrador: "bg-zinc-100 text-zinc-700",
  enviada: "bg-blue-100 text-blue-700",
  parcial: "bg-amber-100 text-amber-700",
  recibida: "bg-green-100 text-green-700",
  cancelada: "bg-red-100 text-red-700",
};

type SearchParams = {
  q?: string;
  estado?: string;
};

export default async function OrdenesCompraPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "compras");

  const q = (searchParams.q ?? "").trim();
  const estado = searchParams.estado ?? "todos";

  const supabase = createClient();
  let query = supabase
    .from("ordenes_compra")
    .select(
      `id, folio, fecha_emision, fecha_esperada, estado, total,
       proveedor:proveedores(id, nombre)`,
    )
    .order("fecha_emision", { ascending: false });

  if (estado !== "todos") {
    if (
      estado === "borrador" ||
      estado === "enviada" ||
      estado === "parcial" ||
      estado === "recibida" ||
      estado === "cancelada"
    ) {
      query = query.eq("estado", estado);
    }
  }

  if (q) query = query.ilike("folio", `%${q}%`);

  const { data: ordenes, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Órdenes de compra
          </h1>
          <p className="text-sm text-zinc-600">
            Gestión de pedidos a proveedores.
          </p>
        </div>
        <Link
          href="/compras/ordenes/nuevo"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
        >
          Nueva OC
        </Link>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Buscar folio
          </label>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="OC-000123"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Estado
          </label>
          <select
            name="estado"
            defaultValue={estado}
            className="mt-1 w-44 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="todos">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="enviada">Enviada</option>
            <option value="parcial">Recibida parcial</option>
            <option value="recibida">Recibida</option>
            <option value="cancelada">Cancelada</option>
          </select>
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
              <th className="px-4 py-2 font-medium">Folio</th>
              <th className="px-4 py-2 font-medium">Proveedor</th>
              <th className="px-4 py-2 font-medium">Emisión</th>
              <th className="px-4 py-2 font-medium">Esperada</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(ordenes ?? []).map((oc) => {
              const prov = Array.isArray(oc.proveedor)
                ? oc.proveedor[0]
                : oc.proveedor;
              return (
                <tr key={oc.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-mono text-xs font-medium text-zinc-900">
                    <Link
                      href={`/compras/ordenes/${oc.id}`}
                      className="hover:underline"
                    >
                      {oc.folio}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-700">
                    {prov?.nombre ?? "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-zinc-600">
                    {oc.fecha_emision}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-zinc-600">
                    {oc.fecha_esperada ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        ESTADO_BADGE[oc.estado] ?? "bg-zinc-100"
                      }`}
                    >
                      {oc.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    ${Number(oc.total).toFixed(2)}
                  </td>
                </tr>
              );
            })}
            {(ordenes ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  {q || estado !== "todos"
                    ? "Sin resultados."
                    : "Aún no hay OCs. Crea la primera."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
