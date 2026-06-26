import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Recepciones · Innovaypunto" };

export default async function RecepcionesPage() {
  await requireRole("admin", "direccion", "almacen");

  const supabase = createClient();

  const [{ data: recepciones }, { data: ocsPorRecibir }] = await Promise.all([
    supabase
      .from("recepciones")
      .select(
        `id, folio, fecha, factura_proveedor,
         oc:ordenes_compra(folio, proveedor:proveedores(nombre)),
         items:recepcion_items(id)`,
      )
      .order("fecha", { ascending: false })
      .limit(50),
    supabase
      .from("ordenes_compra")
      .select(
        `id, folio, fecha_emision, estado, proveedor:proveedores(nombre)`,
      )
      .in("estado", ["enviada", "parcial"])
      .order("fecha_emision"),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recepciones</h1>
        <p className="text-sm text-zinc-600">
          Registro de mercancía recibida del proveedor. Cada recepción genera
          lotes y mueve el inventario.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          OCs pendientes de recibir
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Folio</th>
                <th className="px-4 py-2 font-medium">Proveedor</th>
                <th className="px-4 py-2 font-medium">Emisión</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(ocsPorRecibir ?? []).map((oc) => {
                const prov = Array.isArray(oc.proveedor)
                  ? oc.proveedor[0]
                  : oc.proveedor;
                return (
                  <tr key={oc.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2 font-mono text-xs font-medium">
                      {oc.folio}
                    </td>
                    <td className="px-4 py-2 text-zinc-700">
                      {prov?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-zinc-600">
                      {oc.fecha_emision}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          oc.estado === "parcial"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {oc.estado}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/almacen/recepciones/nuevo?oc_id=${oc.id}`}
                        className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        Registrar recepción
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {(ocsPorRecibir ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No hay OCs pendientes por recibir.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Recepciones recientes
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Folio</th>
                <th className="px-4 py-2 font-medium">OC origen</th>
                <th className="px-4 py-2 font-medium">Proveedor</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Factura</th>
                <th className="px-4 py-2 text-right font-medium">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(recepciones ?? []).map((r) => {
                const oc = Array.isArray(r.oc) ? r.oc[0] : r.oc;
                const prov = oc
                  ? Array.isArray(oc.proveedor)
                    ? oc.proveedor[0]
                    : oc.proveedor
                  : null;
                const items = Array.isArray(r.items) ? r.items.length : 0;
                return (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2 font-mono text-xs font-medium">
                      <Link
                        href={`/almacen/recepciones/${r.id}`}
                        className="hover:underline"
                      >
                        {r.folio}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-600">
                      {oc?.folio ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-700">
                      {prov?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-zinc-600">
                      {r.fecha}
                    </td>
                    <td className="px-4 py-2 text-zinc-600">
                      {r.factura_proveedor ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {items}
                    </td>
                  </tr>
                );
              })}
              {(recepciones ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    Aún no hay recepciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
