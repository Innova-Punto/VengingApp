import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Detalle recepción · MuscleUp" };

export default async function DetalleRecepcionPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion", "almacen");

  const supabase = createClient();

  const { data: rec, error } = await supabase
    .from("recepciones")
    .select(
      `id, folio, fecha, factura_proveedor, notas,
       oc:ordenes_compra(id, folio, proveedor:proveedores(nombre)),
       recibido_por:profiles!recepciones_recibido_por_fkey(full_name)`,
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
  if (!rec) notFound();

  const oc = Array.isArray(rec.oc) ? rec.oc[0] : rec.oc;
  const proveedor = oc
    ? Array.isArray(oc.proveedor)
      ? oc.proveedor[0]
      : oc.proveedor
    : null;
  const recibidoPor = Array.isArray(rec.recibido_por)
    ? rec.recibido_por[0]
    : rec.recibido_por;

  const { data: items } = await supabase
    .from("recepcion_items")
    .select(
      `id, presentaciones_recibidas, peso_total_gramos, unidades_totales,
       lote:lotes(
         id, codigo_lote, fecha_caducidad, gramos_iniciales,
         gramos_disponibles_granel, unidades_iniciales, unidades_disponibles,
         costo_por_gramo,
         producto:productos(sku, nombre, tipo)
       )`,
    )
    .eq("recepcion_id", params.id);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/almacen/recepciones"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Recepciones
        </Link>
        <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight">
          {rec.folio}
        </h1>
        <p className="text-sm text-zinc-600">
          {proveedor?.nombre ?? "—"} · OC{" "}
          {oc?.folio && (
            <Link
              href={`/compras/ordenes/${oc.id}`}
              className="font-mono hover:underline"
            >
              {oc.folio}
            </Link>
          )}
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Stat label="Fecha" value={rec.fecha} />
        <Stat label="Factura" value={rec.factura_proveedor ?? "—"} />
        <Stat label="Recibió" value={recibidoPor?.full_name ?? "—"} />
        <Stat
          label="Items"
          value={String(items?.length ?? 0)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Lotes creados
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Lote</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Cant. recibida</th>
                <th className="px-3 py-2 text-right font-medium">Stock inicial</th>
                <th className="px-3 py-2 text-right font-medium">Costo/u</th>
                <th className="px-3 py-2 font-medium">Caducidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(items ?? []).map((it) => {
                const lote = Array.isArray(it.lote) ? it.lote[0] : it.lote;
                const prod = lote
                  ? Array.isArray(lote.producto)
                    ? lote.producto[0]
                    : lote.producto
                  : null;
                const esPolvo = prod?.tipo === "polvo";
                return (
                  <tr key={it.id}>
                    <td className="px-3 py-2 font-mono text-xs">
                      {lote?.codigo_lote ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-900">
                        {prod?.nombre ?? "—"}
                      </div>
                      <div className="font-mono text-xs text-zinc-500">
                        {prod?.sku ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {it.presentaciones_recibidas}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {esPolvo
                        ? `${it.peso_total_gramos.toLocaleString()} g`
                        : `${it.unidades_totales ?? 0} u`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      $
                      {lote
                        ? Number(lote.costo_por_gramo).toFixed(6)
                        : "—"}
                      <span className="ml-1 text-xs text-zinc-500">
                        /{esPolvo ? "g" : "u"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {lote?.fecha_caducidad ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {rec.notas && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Notas</h2>
          <p className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600 whitespace-pre-wrap">
            {rec.notas}
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
