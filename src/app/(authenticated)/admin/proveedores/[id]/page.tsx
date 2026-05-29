import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import ProveedorForm from "../ProveedorForm";
import PresentacionForm from "../PresentacionForm";
import { toggleActivoPresentacion } from "../actions";

export const metadata = { title: "Editar proveedor · MuscleUp" };

export default async function EditarProveedorPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion", "compras");

  const supabase = createClient();

  const [
    { data: proveedor, error },
    { data: presentaciones },
    { data: productos },
  ] = await Promise.all([
    supabase.from("proveedores").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("presentaciones_proveedor")
      .select(
        "id, producto_id, nombre_presentacion, peso_neto_gramos, unidades_por_presentacion, costo_unitario, moneda, sku_proveedor, activo, productos:productos(id, sku, nombre)",
      )
      .eq("proveedor_id", params.id)
      .order("activo", { ascending: false })
      .order("nombre_presentacion"),
    supabase
      .from("productos")
      .select("id, sku, nombre")
      .eq("activo", true)
      .order("nombre"),
  ]);

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!proveedor) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/proveedores"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Proveedores
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {proveedor.nombre}
        </h1>
        {proveedor.razon_social && (
          <p className="text-sm text-zinc-500">{proveedor.razon_social}</p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Información general
        </h2>
        <div className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6">
          <ProveedorForm mode="editar" proveedor={proveedor} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Presentaciones
          </h2>
          <p className="text-sm text-zinc-600">
            Productos que este proveedor maneja, con su presentación y costo.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 font-medium">Presentación</th>
                <th className="px-4 py-2 text-right font-medium">Peso (g)</th>
                <th className="px-4 py-2 text-right font-medium">Unid.</th>
                <th className="px-4 py-2 text-right font-medium">Costo</th>
                <th className="px-4 py-2 font-medium">SKU prov.</th>
                <th className="px-4 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(presentaciones ?? []).map((p) => {
                const prod = Array.isArray(p.productos)
                  ? p.productos[0]
                  : p.productos;
                return (
                  <tr
                    key={p.id}
                    className={p.activo ? "" : "opacity-50"}
                  >
                    <td className="px-4 py-2 font-medium text-zinc-900">
                      {prod?.nombre ?? "—"}
                      {prod?.sku && (
                        <div className="font-mono text-xs text-zinc-500">
                          {prod.sku}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">{p.nombre_presentacion}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {p.peso_neto_gramos.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {p.unidades_por_presentacion}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {p.moneda} {Number(p.costo_unitario).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-600">
                      {p.sku_proveedor ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form
                        action={toggleActivoPresentacion}
                        className="inline"
                      >
                        <input type="hidden" name="id" value={p.id} />
                        <input
                          type="hidden"
                          name="proveedor_id"
                          value={params.id}
                        />
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
                    </td>
                  </tr>
                );
              })}
              {(presentaciones ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    Este proveedor aún no tiene presentaciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-700">
            Agregar presentación
          </h3>
          {(productos ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">
              No hay productos activos. Crea uno primero en{" "}
              <Link
                href="/admin/productos/nuevo"
                className="underline hover:text-zinc-900"
              >
                Productos
              </Link>
              .
            </p>
          ) : (
            <PresentacionForm
              proveedorId={params.id}
              productos={productos ?? []}
            />
          )}
        </div>
      </section>
    </div>
  );
}
