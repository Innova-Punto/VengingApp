import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Lotes · Innovaypunto" };

type SearchParams = { q?: string; estado?: string };

export default async function LotesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "almacen");

  const q = (searchParams.q ?? "").trim();
  const estado = searchParams.estado ?? "con_stock";

  const supabase = createClient();
  let query = supabase
    .from("lotes")
    .select(
      `id, codigo_lote, fecha_recepcion, fecha_caducidad,
       gramos_iniciales, gramos_disponibles_granel,
       unidades_iniciales, unidades_disponibles,
       costo_por_gramo, activo,
       producto:productos(id, sku, nombre, tipo),
       proveedor:proveedores(nombre)`,
    )
    .order("fecha_recepcion", { ascending: false })
    .limit(100);

  if (estado === "con_stock") {
    // mostrar solo lotes con algo disponible
    query = query.or(
      "gramos_disponibles_granel.gt.0,unidades_disponibles.gt.0",
    );
  } else if (estado === "agotados") {
    query = query
      .eq("gramos_disponibles_granel", 0)
      .or("unidades_disponibles.eq.0,unidades_disponibles.is.null");
  }

  if (q) {
    query = query.ilike("codigo_lote", `%${q}%`);
  }

  const { data: lotes, error } = await query;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lotes</h1>
        <p className="text-sm text-zinc-600">
          Inventario de mercancía recibida, con su stock disponible y costo.
        </p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Código de lote
          </label>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="LOT-..."
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Stock
          </label>
          <select
            name="estado"
            defaultValue={estado}
            className="mt-1 w-44 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="con_stock">Con stock disponible</option>
            <option value="agotados">Agotados</option>
            <option value="todos">Todos</option>
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
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium">Proveedor</th>
              <th className="px-3 py-2 font-medium">Recepción</th>
              <th className="px-3 py-2 font-medium">Caducidad</th>
              <th className="px-3 py-2 text-right font-medium">Disponible</th>
              <th className="px-3 py-2 text-right font-medium">Inicial</th>
              <th className="px-3 py-2 text-right font-medium">Costo/u</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(lotes ?? []).map((l) => {
              const prod = Array.isArray(l.producto) ? l.producto[0] : l.producto;
              const prov = Array.isArray(l.proveedor)
                ? l.proveedor[0]
                : l.proveedor;
              const esPolvo = prod?.tipo === "polvo";
              const disponible = esPolvo
                ? `${l.gramos_disponibles_granel.toLocaleString()} g`
                : `${l.unidades_disponibles ?? 0} u`;
              const inicial = esPolvo
                ? `${l.gramos_iniciales.toLocaleString()} g`
                : `${l.unidades_iniciales ?? 0} u`;
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2 font-mono text-xs">
                    {l.codigo_lote}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">
                      {prod?.nombre ?? "—"}
                    </div>
                    <div className="font-mono text-xs text-zinc-500">
                      {prod?.sku ?? "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {prov?.nombre ?? "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-600">
                    {l.fecha_recepcion}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {l.fecha_caducidad ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {disponible}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {inicial}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ${Number(l.costo_por_gramo).toFixed(6)}
                    <span className="ml-1 text-xs text-zinc-500">
                      /{esPolvo ? "g" : "u"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {(lotes ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-zinc-500"
                >
                  {q ? "Sin resultados." : "Aún no hay lotes."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
