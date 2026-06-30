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

  const { data: granelRaw } = await supabase
    .from("conteo_granel_items")
    .select(
      `id, gramos_sistema, gramos_fisicos, valor_diferencia,
       lote:lotes(
         id, producto_id,
         producto:productos(sku, nombre)
       )`,
    )
    .eq("conteo_id", params.id)
    .order("created_at");

  const { data: cartuchosRaw } = await supabase
    .from("conteo_cartuchos_items")
    .select(
      `id, producto_id, cantidad_sistema, cantidad_fisica, valor_diferencia,
       producto:productos(sku, nombre)`,
    )
    .eq("conteo_id", params.id)
    .order("created_at");

  // Vasos (tabla nueva; sin tipos generados, usamos cliente sin tipar)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: vasosRaw } = await (supabase as any)
    .from("conteo_vasos_items")
    .select(
      `id, producto_id, unidades_sistema, unidades_fisicas, valor_diferencia,
       producto:productos(sku, nombre)`,
    )
    .eq("conteo_id", params.id)
    .order("created_at");

  // Consolidar por producto (en bodega el inventario está junto, no por lote).
  type Grp = {
    producto_id: string;
    producto_sku: string;
    producto_nombre: string;
    sistema: number;
    fisico: number;
    valor: number;
  };
  const granelMap = new Map<string, Grp>();
  for (const g of granelRaw ?? []) {
    const lote = Array.isArray(g.lote) ? g.lote[0] : g.lote;
    const prodId = lote?.producto_id;
    if (!prodId) continue;
    const prod = lote?.producto
      ? Array.isArray(lote.producto)
        ? lote.producto[0]
        : lote.producto
      : null;
    const cur =
      granelMap.get(prodId) ?? {
        producto_id: prodId,
        producto_sku: prod?.sku ?? "—",
        producto_nombre: prod?.nombre ?? "—",
        sistema: 0,
        fisico: 0,
        valor: 0,
      };
    cur.sistema += g.gramos_sistema ?? 0;
    cur.fisico += g.gramos_fisicos ?? 0;
    cur.valor += Number(g.valor_diferencia ?? 0);
    granelMap.set(prodId, cur);
  }
  const cartuchosMap = new Map<string, Grp>();
  for (const c of cartuchosRaw ?? []) {
    const prodId = c.producto_id;
    if (!prodId) continue;
    const prod = Array.isArray(c.producto) ? c.producto[0] : c.producto;
    const cur =
      cartuchosMap.get(prodId) ?? {
        producto_id: prodId,
        producto_sku: prod?.sku ?? "—",
        producto_nombre: prod?.nombre ?? "—",
        sistema: 0,
        fisico: 0,
        valor: 0,
      };
    cur.sistema += c.cantidad_sistema ?? 0;
    cur.fisico += c.cantidad_fisica ?? 0;
    cur.valor += Number(c.valor_diferencia ?? 0);
    cartuchosMap.set(prodId, cur);
  }
  const vasosMap = new Map<string, Grp>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of (vasosRaw ?? []) as any[]) {
    const prodId = v.producto_id as string | null;
    if (!prodId) continue;
    const prod = Array.isArray(v.producto) ? v.producto[0] : v.producto;
    const cur =
      vasosMap.get(prodId) ?? {
        producto_id: prodId,
        producto_sku: prod?.sku ?? "—",
        producto_nombre: prod?.nombre ?? "—",
        sistema: 0,
        fisico: 0,
        valor: 0,
      };
    cur.sistema += v.unidades_sistema ?? 0;
    cur.fisico += v.unidades_fisicas ?? 0;
    cur.valor += Number(v.valor_diferencia ?? 0);
    vasosMap.set(prodId, cur);
  }

  const granelGrupos = Array.from(granelMap.values()).sort((a, b) =>
    a.producto_nombre.localeCompare(b.producto_nombre),
  );
  const cartuchosGrupos = Array.from(cartuchosMap.values()).sort((a, b) =>
    a.producto_nombre.localeCompare(b.producto_nombre),
  );
  const vasosGrupos = Array.from(vasosMap.values()).sort((a, b) =>
    a.producto_nombre.localeCompare(b.producto_nombre),
  );

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
        granel={granelGrupos.map((g) => ({
          producto_id: g.producto_id,
          producto_sku: g.producto_sku,
          producto_nombre: g.producto_nombre,
          gramos_sistema: g.sistema,
          gramos_fisicos: g.fisico,
          valor_diferencia: g.valor,
        }))}
        cartuchos={cartuchosGrupos.map((c) => ({
          producto_id: c.producto_id,
          producto_sku: c.producto_sku,
          producto_nombre: c.producto_nombre,
          cantidad_sistema: c.sistema,
          cantidad_fisica: c.fisico,
          valor_diferencia: c.valor,
        }))}
        vasos={vasosGrupos.map((v) => ({
          producto_id: v.producto_id,
          producto_sku: v.producto_sku,
          producto_nombre: v.producto_nombre,
          unidades_sistema: v.sistema,
          unidades_fisicas: v.fisico,
          valor_diferencia: v.valor,
        }))}
      />
    </div>
  );
}
