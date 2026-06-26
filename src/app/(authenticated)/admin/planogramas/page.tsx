import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { toggleActivoPlanograma } from "./actions";

export const metadata = { title: "Planogramas · Innovaypunto" };

type SearchParams = { q?: string; estado?: string };

export default async function PlanogramasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion");

  const q = (searchParams.q ?? "").trim();
  const estado = searchParams.estado === "inactivos" ? "inactivos" : "activos";

  const supabase = createClient();
  let query = supabase
    .from("planogramas")
    .select(
      "id, nombre, descripcion, num_tolvas, activo, items:planograma_items(id)",
    )
    .order("nombre");

  if (estado === "activos") query = query.eq("activo", true);
  else query = query.eq("activo", false);

  if (q) {
    query = query.or(`nombre.ilike.%${q}%,descripcion.ilike.%${q}%`);
  }

  const { data: planogramas, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planogramas</h1>
          <p className="text-sm text-zinc-600">
            Templates de configuración de tolvas reutilizables. Aplica un
            template a múltiples máquinas con un click.
          </p>
        </div>
        <Link
          href="/admin/planogramas/nuevo"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
        >
          Nuevo planograma
        </Link>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Buscar
          </label>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nombre o descripción..."
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
            className="mt-1 w-36 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
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
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Descripción</th>
              <th className="px-4 py-2 text-right font-medium">Tolvas conf.</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(planogramas ?? []).map((p) => {
              const itemsCount = Array.isArray(p.items) ? p.items.length : 0;
              return (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    <Link
                      href={`/admin/planogramas/${p.id}`}
                      className="hover:underline"
                    >
                      {p.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {p.descripcion ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">
                    <span className="font-medium">{itemsCount}</span>
                    <span className="text-zinc-400"> / {p.num_tolvas}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/admin/planogramas/${p.id}`}
                        className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                      >
                        Editar
                      </Link>
                      <form
                        action={toggleActivoPlanograma}
                        className="inline"
                      >
                        <input type="hidden" name="id" value={p.id} />
                        <input
                          type="hidden"
                          name="activo"
                          value={p.activo ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                        >
                          {p.activo ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(planogramas ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  {q
                    ? "Sin resultados."
                    : "Aún no hay planogramas. Crea el primero."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
