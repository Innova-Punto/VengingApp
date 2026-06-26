import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import RecepcionForm from "./RecepcionForm";

export const metadata = { title: "Nueva recepción · Innovaypunto" };

export default async function NuevaRecepcionPage({
  searchParams,
}: {
  searchParams: { oc_id?: string };
}) {
  await requireRole("admin", "direccion", "almacen");

  if (!searchParams.oc_id) redirect("/almacen/recepciones");

  const supabase = createClient();

  const { data: oc, error } = await supabase
    .from("ordenes_compra")
    .select(
      `id, folio, estado, fecha_emision, fecha_esperada,
       proveedor:proveedores(id, nombre),
       items:oc_items(
         id, cantidad, recibido, costo_unitario,
         presentacion:presentaciones_proveedor(
           nombre_presentacion, peso_neto_gramos, unidades_por_presentacion,
           producto:productos(sku, nombre, tipo)
         )
       )`,
    )
    .eq("id", searchParams.oc_id)
    .maybeSingle();

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!oc) notFound();

  if (oc.estado !== "enviada" && oc.estado !== "parcial") {
    return (
      <div className="space-y-4">
        <Link
          href="/almacen/recepciones"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Recepciones
        </Link>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          La OC <span className="font-mono">{oc.folio}</span> está en estado{" "}
          <strong>{oc.estado}</strong> y no admite recepciones.
        </p>
      </div>
    );
  }

  const proveedor = Array.isArray(oc.proveedor) ? oc.proveedor[0] : oc.proveedor;

  const items = (oc.items ?? []).map((it) => {
    const pres = Array.isArray(it.presentacion)
      ? it.presentacion[0]
      : it.presentacion;
    const prod = pres
      ? Array.isArray(pres.producto)
        ? pres.producto[0]
        : pres.producto
      : null;
    return {
      id: it.id,
      cantidad: it.cantidad,
      recibido: it.recibido,
      pendiente: it.cantidad - it.recibido,
      producto_sku: prod?.sku ?? "—",
      producto_nombre: prod?.nombre ?? "—",
      producto_tipo: (prod?.tipo ?? "polvo") as "polvo" | "vaso",
      presentacion_nombre: pres?.nombre_presentacion ?? "—",
      peso_neto_gramos: pres?.peso_neto_gramos ?? 0,
      unidades_por_presentacion: pres?.unidades_por_presentacion ?? 1,
      costo_unitario: Number(it.costo_unitario),
    };
  });

  const itemsConPendiente = items.filter((it) => it.pendiente > 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/compras/ordenes/${oc.id}`}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← {oc.folio}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Registrar recepción
        </h1>
        <p className="text-sm text-zinc-500">
          Proveedor: <strong>{proveedor?.nombre}</strong> · OC{" "}
          <span className="font-mono">{oc.folio}</span>
        </p>
      </div>

      {itemsConPendiente.length === 0 ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Esta OC ya tiene todos sus items recibidos.
        </p>
      ) : (
        <RecepcionForm ocId={oc.id} items={itemsConPendiente} />
      )}
    </div>
  );
}
