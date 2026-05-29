import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { toggleActivoProducto } from "./actions";

export const metadata = { title: "Productos · MuscleUp" };

type SearchParams = {
  q?: string;
  tipo?: string;
  estado?: string;
  created?: string;
};

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "compras");

  const q = (searchParams.q ?? "").trim();
  const tipo = searchParams.tipo === "polvo" || searchParams.tipo === "vaso"
    ? searchParams.tipo
    : undefined;
  const estado = searchParams.estado === "inactivos" ? "inactivos" : "activos";

  const supabase = createClient();
  let query = supabase
    .from("productos")
    .select(
      "id, sku, nombre, tipo, marca, sabor, categoria, gramaje_cartucho_default, precio_venta_default, activo",
    )
    .order("created_at", { ascending: false });

  if (tipo) query = query.eq("tipo", tipo);
  if (estado === "activos") query = query.eq("activo", true);
  else query = query.eq("activo", false);
  if (q) {
    query = query.or(
      `sku.ilike.%${q}%,nombre.ilike.%${q}%,marca.ilike.%${q}%,sabor.ilike.%${q}%`,
    );
  }

  const { data: productos, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-zinc-600">
            Catálogo de polvos y vasos.
          </p>
        </div>
        <Link
          href="/admin/productos/nuevo"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
        >
          Nuevo producto
        </Link>
      </div>

      {searchParams.created && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Producto creado correctamente.
        </p>
      )}

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
            placeholder="SKU, nombre, marca, sabor..."
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Tipo
          </label>
          <select
            name="tipo"
            defaultValue={tipo ?? ""}
            className="mt-1 w-32 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">Todos</option>
            <option value="polvo">Polvo</option>
            <option value="vaso">Vaso</option>
          </select>
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
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Sabor</th>
              <th className="px-4 py-2 text-right font-medium">Cartucho (g)</th>
              <th className="px-4 py-2 text-right font-medium">Precio</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(productos ?? []).map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2 font-mono text-xs text-zinc-700">
                  {p.sku}
                </td>
                <td className="px-4 py-2 font-medium text-zinc-900">
                  <Link
                    href={`/admin/productos/${p.id}`}
                    className="hover:underline"
                  >
                    {p.nombre}
                  </Link>
                  {p.marca && (
                    <span className="ml-1 text-xs text-zinc-500">
                      · {p.marca}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.tipo === "polvo"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {p.tipo}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600">{p.sabor ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {p.gramaje_cartucho_default}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {p.precio_venta_default
                    ? `$${Number(p.precio_venta_default).toFixed(2)}`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/productos/${p.id}`}
                      className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                    >
                      Editar
                    </Link>
                    <form action={toggleActivoProducto} className="inline">
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
            ))}
            {(productos ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  {q || tipo
                    ? "Sin resultados para los filtros aplicados."
                    : "Aún no hay productos. Crea el primero."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
