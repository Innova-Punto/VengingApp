import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { toggleActivaRuta } from "./actions";

export const metadata = { title: "Rutas · MuscleUp" };

type SearchParams = { estado?: string };

export default async function RutasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "planeador");

  const estado = searchParams.estado === "inactivas" ? "inactivas" : "activas";

  const supabase = createClient();
  let query = supabase
    .from("rutas")
    .select(
      `id, nombre, descripcion, color_hex, activa,
       operador:profiles(full_name),
       maquinas:ruta_maquinas(maquina_id)`,
    )
    .order("nombre");

  if (estado === "activas") query = query.eq("activa", true);
  else query = query.eq("activa", false);

  const { data: rutas, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rutas</h1>
          <p className="text-sm text-zinc-600">
            Conjuntos de máquinas que visita el mismo operador. Base para la
            planeación diaria.
          </p>
        </div>
        <Link
          href="/admin/rutas/nuevo"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
        >
          Nueva ruta
        </Link>
      </div>

      <form
        method="get"
        className="flex items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Estado
          </label>
          <select
            name="estado"
            defaultValue={estado}
            className="mt-1 w-36 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="activas">Activas</option>
            <option value="inactivas">Inactivas</option>
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
              <th className="px-4 py-2 font-medium w-8"></th>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Operador titular</th>
              <th className="px-4 py-2 text-right font-medium">Máquinas</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(rutas ?? []).map((r) => {
              const op = Array.isArray(r.operador)
                ? r.operador[0]
                : r.operador;
              const maquinasCount = Array.isArray(r.maquinas)
                ? r.maquinas.length
                : 0;
              return (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2">
                    <div
                      className="h-6 w-2 rounded-sm"
                      style={{
                        backgroundColor: r.color_hex ?? "#a1a1aa",
                      }}
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    <Link
                      href={`/admin/rutas/${r.id}`}
                      className="hover:underline"
                    >
                      {r.nombre}
                    </Link>
                    {r.descripcion && (
                      <div className="text-xs text-zinc-500">
                        {r.descripcion}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-700">
                    {op?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {maquinasCount}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/admin/rutas/${r.id}`}
                        className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                      >
                        Editar
                      </Link>
                      <form action={toggleActivaRuta} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input
                          type="hidden"
                          name="activa"
                          value={r.activa ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                        >
                          {r.activa ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(rutas ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  Aún no hay rutas. Crea la primera para empezar a planear.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
