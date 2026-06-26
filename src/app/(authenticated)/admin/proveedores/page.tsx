import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { toggleActivoProveedor } from "./actions";

export const metadata = { title: "Proveedores · Innovaypunto" };

type SearchParams = { q?: string; estado?: string };

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "compras");

  const q = (searchParams.q ?? "").trim();
  const estado = searchParams.estado === "inactivos" ? "inactivos" : "activos";

  const supabase = createClient();
  let query = supabase
    .from("proveedores")
    .select(
      "id, nombre, razon_social, rfc, contacto_nombre, contacto_email, dias_credito, activo",
    )
    .order("nombre");

  if (estado === "activos") query = query.eq("activo", true);
  else query = query.eq("activo", false);

  if (q) {
    query = query.or(
      `nombre.ilike.%${q}%,razon_social.ilike.%${q}%,rfc.ilike.%${q}%,contacto_nombre.ilike.%${q}%`,
    );
  }

  const { data: proveedores, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
          <p className="text-sm text-zinc-600">
            Quienes nos venden polvos, vasos y otros insumos.
          </p>
        </div>
        <Link
          href="/admin/proveedores/nuevo"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
        >
          Nuevo proveedor
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
            placeholder="Nombre, razón social, RFC, contacto..."
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
              <th className="px-4 py-2 font-medium">RFC</th>
              <th className="px-4 py-2 font-medium">Contacto</th>
              <th className="px-4 py-2 text-right font-medium">Días crédito</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(proveedores ?? []).map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2 font-medium text-zinc-900">
                  <Link
                    href={`/admin/proveedores/${p.id}`}
                    className="hover:underline"
                  >
                    {p.nombre}
                  </Link>
                  {p.razon_social && (
                    <div className="text-xs text-zinc-500">
                      {p.razon_social}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-700">
                  {p.rfc ?? "—"}
                </td>
                <td className="px-4 py-2 text-zinc-600">
                  {p.contacto_nombre ?? "—"}
                  {p.contacto_email && (
                    <div className="text-xs text-zinc-500">
                      {p.contacto_email}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {p.dias_credito}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/proveedores/${p.id}`}
                      className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                    >
                      Editar
                    </Link>
                    <form action={toggleActivoProveedor} className="inline">
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
            {(proveedores ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  {q
                    ? "Sin resultados para los filtros aplicados."
                    : "Aún no hay proveedores. Crea el primero."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
