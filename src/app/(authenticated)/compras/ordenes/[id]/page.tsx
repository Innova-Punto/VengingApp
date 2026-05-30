import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { aprobarOc, cancelarOc, cerrarOcIncompleta, eliminarItem } from "../actions";
import AgregarItemForm from "./AgregarItemForm";

export const metadata = { title: "Detalle OC · MuscleUp" };

const ESTADO_BADGE: Record<string, string> = {
  borrador: "bg-zinc-100 text-zinc-700",
  enviada: "bg-blue-100 text-blue-700",
  parcial: "bg-amber-100 text-amber-700",
  recibida: "bg-green-100 text-green-700",
  cancelada: "bg-red-100 text-red-700",
};

export default async function DetalleOcPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion", "compras");

  const supabase = createClient();

  const { data: oc, error } = await supabase
    .from("ordenes_compra")
    .select(
      `id, folio, fecha_emision, fecha_esperada, estado, subtotal, iva, total, notas, motivo_cierre,
       proveedor:proveedores(id, nombre, rfc)`,
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!oc) notFound();

  const proveedor = Array.isArray(oc.proveedor) ? oc.proveedor[0] : oc.proveedor;

  const [{ data: items }, { data: presentacionesRaw }] = await Promise.all([
    supabase
      .from("oc_items")
      .select(
        `id, cantidad, costo_unitario, iva_tasa, subtotal_item, recibido, notas,
         presentacion:presentaciones_proveedor(
           id, nombre_presentacion, peso_neto_gramos,
           producto:productos(sku, nombre)
         )`,
      )
      .eq("oc_id", params.id)
      .order("created_at"),
    proveedor
      ? supabase
          .from("presentaciones_proveedor")
          .select(
            `id, nombre_presentacion, peso_neto_gramos, unidades_por_presentacion,
             costo_unitario, iva_tasa, sku_proveedor,
             producto:productos(id, sku, nombre)`,
          )
          .eq("proveedor_id", proveedor.id)
          .eq("activo", true)
          .order("nombre_presentacion")
      : Promise.resolve({ data: [] }),
  ]);

  const presentaciones = (presentacionesRaw ?? []).map((p) => {
    const prod = Array.isArray(p.producto) ? p.producto[0] : p.producto;
    return {
      id: p.id,
      nombre_presentacion: p.nombre_presentacion,
      peso_neto_gramos: p.peso_neto_gramos,
      unidades_por_presentacion: p.unidades_por_presentacion,
      costo_unitario: Number(p.costo_unitario),
      iva_tasa: Number(p.iva_tasa),
      sku_proveedor: p.sku_proveedor,
      producto_id: prod?.id ?? "",
      producto_sku: prod?.sku ?? "",
      producto_nombre: prod?.nombre ?? "",
    };
  });

  const isBorrador = oc.estado === "borrador";
  const tieneItems = (items ?? []).length > 0;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/compras/ordenes"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Órdenes de compra
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {oc.folio}
          </h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              ESTADO_BADGE[oc.estado] ?? "bg-zinc-100"
            }`}
          >
            {oc.estado}
          </span>
        </div>
        {proveedor && (
          <p className="text-sm text-zinc-600">{proveedor.nombre}</p>
        )}
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Stat label="Emisión" value={oc.fecha_emision} />
        <Stat
          label="Esperada"
          value={oc.fecha_esperada ?? "—"}
        />
        <Stat
          label="Subtotal"
          value={`$${Number(oc.subtotal).toFixed(2)}`}
        />
        <Stat label="Total c/IVA" value={`$${Number(oc.total).toFixed(2)}`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Items</h2>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 font-medium">Presentación</th>
                <th className="px-4 py-2 text-right font-medium">Cant.</th>
                <th className="px-4 py-2 text-right font-medium">
                  Costo s/IVA
                </th>
                <th className="px-4 py-2 text-right font-medium">IVA</th>
                <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                <th className="px-4 py-2 text-right font-medium">IVA item</th>
                <th className="px-4 py-2 text-right font-medium">Recibido</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(items ?? []).map((it) => {
                const pres = Array.isArray(it.presentacion)
                  ? it.presentacion[0]
                  : it.presentacion;
                const prod = pres
                  ? Array.isArray(pres.producto)
                    ? pres.producto[0]
                    : pres.producto
                  : null;
                const ivaItem =
                  Math.round(
                    Number(it.subtotal_item) * Number(it.iva_tasa) * 100,
                  ) / 100;
                return (
                  <tr key={it.id}>
                    <td className="px-4 py-2 font-medium text-zinc-900">
                      {prod?.nombre ?? "—"}
                      {prod?.sku && (
                        <div className="font-mono text-xs text-zinc-500">
                          {prod.sku}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-600">
                      {pres?.nombre_presentacion ?? "—"}
                      {pres?.peso_neto_gramos != null && (
                        <div className="text-xs text-zinc-500">
                          {pres.peso_neto_gramos}g c/u
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {it.cantidad}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      ${Number(it.costo_unitario).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs text-zinc-600">
                      {(Number(it.iva_tasa) * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      ${Number(it.subtotal_item).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
                      ${ivaItem.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
                      {it.recibido} / {it.cantidad}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {isBorrador && (
                        <form action={eliminarItem} className="inline">
                          <input type="hidden" name="id" value={it.id} />
                          <input
                            type="hidden"
                            name="oc_id"
                            value={params.id}
                          />
                          <button
                            type="submit"
                            className="text-xs font-medium text-red-600 hover:text-red-700"
                          >
                            Eliminar
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!tieneItems && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    Aún no hay items en esta OC.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isBorrador && (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4">
            <h3 className="mb-3 text-sm font-medium text-zinc-700">
              Agregar item
            </h3>
            {presentaciones.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Este proveedor no tiene presentaciones activas. Configúralas
                en su detalle.
              </p>
            ) : (
              <AgregarItemForm
                ocId={params.id}
                presentaciones={presentaciones}
              />
            )}
          </div>
        )}
      </section>

      {isBorrador && (
        <section className="flex flex-wrap gap-3">
          <form action={aprobarOc}>
            <input type="hidden" name="id" value={params.id} />
            <button
              type="submit"
              disabled={!tieneItems}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enviar al proveedor
            </button>
          </form>
          <form action={cancelarOc}>
            <input type="hidden" name="id" value={params.id} />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancelar OC
            </button>
          </form>
          {!tieneItems && (
            <p className="text-xs text-zinc-500 self-center">
              Agrega al menos un item para poder enviar.
            </p>
          )}
        </section>
      )}

      {(oc.estado === "enviada" || oc.estado === "parcial") && (
        <section className="space-y-3">
          <Link
            href={`/almacen/recepciones/nuevo?oc_id=${params.id}`}
            className="inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
          >
            Registrar recepción
          </Link>

          {oc.estado === "parcial" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-2 text-sm font-medium text-amber-900">
                Cerrar OC con faltantes
              </h3>
              <p className="mb-3 text-xs text-amber-800">
                Úsalo si el proveedor no puede surtir el resto y vas a comprar
                el faltante a otro proveedor. La OC pasa a &laquo;recibida&raquo;
                aunque queden items pendientes.
              </p>
              <form action={cerrarOcIncompleta} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={params.id} />
                <input
                  name="motivo"
                  required
                  placeholder="Motivo (ej. proveedor sin stock)"
                  className="flex-1 min-w-[240px] rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700"
                >
                  Cerrar OC
                </button>
              </form>
            </div>
          )}
        </section>
      )}

      {oc.motivo_cierre && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">
            Motivo de cierre con faltantes
          </h2>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 whitespace-pre-wrap">
            {oc.motivo_cierre}
          </p>
        </section>
      )}

      {oc.notas && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Notas</h2>
          <p className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600 whitespace-pre-wrap">
            {oc.notas}
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-zinc-900 tabular-nums">
        {value}
      </div>
    </div>
  );
}
