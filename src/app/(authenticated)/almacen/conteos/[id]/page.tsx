import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import ConteoForm from "./ConteoForm";

export default async function ConteoDetallePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion", "almacen");
  const supabase = createClient();

  const { data: conteo } = await supabase
    .from("conteos_almacen")
    .select(
      `id, fecha, estado, notas,
       cierre:cierres_mensuales!conteos_almacen_cierre_id_fkey(
         id, periodo_mes, periodo_anio
       )`,
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!conteo) notFound();

  const { data: granel } = await supabase
    .from("conteo_granel_items")
    .select(
      `id, gramos_sistema, gramos_fisicos, diferencia, valor_diferencia,
       lote:lotes(
         id, codigo_lote,
         producto:productos(sku, nombre)
       )`,
    )
    .eq("conteo_id", params.id)
    .order("created_at");

  const { data: cartuchos } = await supabase
    .from("conteo_cartuchos_items")
    .select(
      `id, cantidad_sistema, cantidad_fisica, diferencia, valor_diferencia,
       encartuchado:encartuchados!conteo_cartuchos_items_encartuchado_id_fkey(
         id, folio,
         producto:productos(sku, nombre)
       )`,
    )
    .eq("conteo_id", params.id)
    .order("created_at");

  const editable = conteo.estado === "en_proceso";

  const cierre = Array.isArray(conteo.cierre) ? conteo.cierre[0] : conteo.cierre;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/almacen/conteos"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Conteos
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Conteo del{" "}
            {fmtCDMX(conteo.fecha, { day: "2-digit", month: "short", year: "numeric" })}
          </h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              conteo.estado === "completado"
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {conteo.estado}
          </span>
        </div>
        {cierre && (
          <p className="text-xs text-zinc-500">
            Cierre {String(cierre.periodo_mes).padStart(2, "0")}/
            {cierre.periodo_anio}
          </p>
        )}
      </div>

      <ConteoForm
        conteoId={conteo.id}
        editable={editable}
        granel={(granel ?? []).map((g) => {
          const lote = Array.isArray(g.lote) ? g.lote[0] : g.lote;
          const prod = lote?.producto
            ? Array.isArray(lote.producto)
              ? lote.producto[0]
              : lote.producto
            : null;
          return {
            id: g.id,
            lote: lote?.codigo_lote ?? "—",
            producto_sku: prod?.sku ?? "—",
            producto_nombre: prod?.nombre ?? "—",
            gramos_sistema: g.gramos_sistema,
            gramos_fisicos: g.gramos_fisicos ?? 0,
            diferencia: g.diferencia ?? 0,
            valor_diferencia: Number(g.valor_diferencia ?? 0),
          };
        })}
        cartuchos={(cartuchos ?? []).map((c) => {
          const enc = Array.isArray(c.encartuchado)
            ? c.encartuchado[0]
            : c.encartuchado;
          const prod = enc?.producto
            ? Array.isArray(enc.producto)
              ? enc.producto[0]
              : enc.producto
            : null;
          return {
            id: c.id,
            encartuchado_folio: enc?.folio ?? "—",
            producto_sku: prod?.sku ?? "—",
            producto_nombre: prod?.nombre ?? "—",
            cantidad_sistema: c.cantidad_sistema,
            cantidad_fisica: c.cantidad_fisica ?? 0,
            diferencia: c.diferencia ?? 0,
            valor_diferencia: Number(c.valor_diferencia ?? 0),
          };
        })}
      />
    </div>
  );
}
