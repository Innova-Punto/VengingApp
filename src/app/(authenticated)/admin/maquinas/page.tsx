import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Máquinas · MuscleUp" };

type SearchParams = { q?: string; estado?: string };

const ESTADO_BADGE: Record<string, string> = {
  operativa: "bg-green-100 text-green-700",
  mantenimiento: "bg-amber-100 text-amber-700",
  baja: "bg-zinc-200 text-zinc-700",
};

export default async function MaquinasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion");

  const q = (searchParams.q ?? "").trim();
  const estado = searchParams.estado ?? "todos";

  const supabase = createClient();
  let query = supabase
    .from("maquinas")
    .select(
      `id, serie, alias, modelo, estado, nayax_machine_id,
       fecha_instalacion, frecuencia_visita_dias,
       ubicacion:ubicaciones(id, nombre, cliente:clientes(id, nombre)),
       tolvas:tolvas(id, producto_id)`,
    )
    .order("serie");

  if (
    estado === "operativa" ||
    estado === "mantenimiento" ||
    estado === "baja"
  ) {
    query = query.eq("estado", estado);
  }

  if (q) {
    query = query.or(
      `serie.ilike.%${q}%,alias.ilike.%${q}%,nayax_machine_id.ilike.%${q}%`,
    );
  }

  const { data: maquinas, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Máquinas</h1>
          <p className="text-sm text-zinc-600">
            Máquinas vending desplegadas en sitio.
          </p>
        </div>
        <Link
          href="/admin/maquinas/nuevo"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
        >
          Nueva máquina
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
            placeholder="Serie, alias, nayax ID..."
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
            <option value="operativa">Operativas</option>
            <option value="mantenimiento">Mantenimiento</option>
            <option value="baja">Bajas</option>
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
              <th className="px-4 py-2 font-medium">Serie</th>
              <th className="px-4 py-2 font-medium">Cliente / Ubicación</th>
              <th className="px-4 py-2 font-medium">Modelo</th>
              <th className="px-4 py-2 text-right font-medium">Tolvas</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(maquinas ?? []).map((m) => {
              const ubic = Array.isArray(m.ubicacion)
                ? m.ubicacion[0]
                : m.ubicacion;
              const cliente = ubic
                ? Array.isArray(ubic.cliente)
                  ? ubic.cliente[0]
                  : ubic.cliente
                : null;
              const tolvas = Array.isArray(m.tolvas) ? m.tolvas : [];
              const configuradas = tolvas.filter(
                (t) => t.producto_id !== null,
              ).length;
              return (
                <tr key={m.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-mono text-xs font-medium text-zinc-900">
                    <Link
                      href={`/admin/maquinas/${m.id}`}
                      className="hover:underline"
                    >
                      {m.serie}
                    </Link>
                    {m.alias && (
                      <div className="font-sans text-xs text-zinc-500">
                        {m.alias}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-700">
                    {cliente?.nombre ?? "—"}
                    {ubic?.nombre && (
                      <div className="text-xs text-zinc-500">
                        {ubic.nombre}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {m.modelo ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs">
                    <span className="font-medium">{configuradas}</span>
                    <span className="text-zinc-400"> / {tolvas.length}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        ESTADO_BADGE[m.estado] ?? "bg-zinc-100"
                      }`}
                    >
                      {m.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/maquinas/${m.id}`}
                      className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                    >
                      Configurar
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(maquinas ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  {q
                    ? "Sin resultados para los filtros aplicados."
                    : "Aún no hay máquinas. Crea la primera."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
