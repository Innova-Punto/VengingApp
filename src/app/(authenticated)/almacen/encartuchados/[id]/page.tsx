import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Detalle encartuchado · MuscleUp" };

export default async function DetalleEncartuchadoPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion", "almacen");

  const supabase = createClient();

  const { data: enc, error } = await supabase
    .from("encartuchados")
    .select(
      `id, folio, fecha, cartuchos_producidos, cantidad_disponible,
       gramos_por_cartucho, gramos_totales_consumidos, gramos_merma,
       costo_promedio_g, notas,
       producto:productos(sku, nombre),
       operario:profiles(full_name)`,
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
  if (!enc) notFound();

  const prod = Array.isArray(enc.producto) ? enc.producto[0] : enc.producto;
  const operario = Array.isArray(enc.operario)
    ? enc.operario[0]
    : enc.operario;

  const { data: lotes } = await supabase
    .from("encartuchado_lotes")
    .select(
      `id, gramos_consumidos, costo_por_gramo_lote, valor_aportado,
       lote:lotes(id, codigo_lote, fecha_recepcion)`,
    )
    .eq("encartuchado_id", params.id);

  const { data: movs } = await supabase
    .from("movimientos_inventario")
    .select("tipo, gramos, cantidad_cartuchos, valor_movimiento, fecha")
    .eq("encartuchado_id", params.id)
    .order("fecha");

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/almacen/encartuchados"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Encartuchados
        </Link>
        <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight">
          {enc.folio}
        </h1>
        <p className="text-sm text-zinc-600">
          {prod?.nombre} ({prod?.sku})
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Producidos" value={String(enc.cartuchos_producidos)} />
        <Stat label="Disponibles" value={String(enc.cantidad_disponible)} />
        <Stat
          label="Gramos / cartucho"
          value={`${enc.gramos_por_cartucho} g`}
        />
        <Stat
          label="Consumo total"
          value={`${enc.gramos_totales_consumidos.toLocaleString()} g`}
        />
        <Stat
          label="Merma"
          value={enc.gramos_merma > 0 ? `${enc.gramos_merma} g` : "—"}
        />
        <Stat
          label="Costo prom. /g"
          value={`$${Number(enc.costo_promedio_g).toFixed(6)}`}
        />
        <Stat
          label="Operario"
          value={operario?.full_name ?? "—"}
        />
        <Stat
          label="Fecha"
          value={fmtCDMX(enc.fecha)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Lotes consumidos (PEPS)
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Lote</th>
                <th className="px-4 py-2 font-medium">Recepción</th>
                <th className="px-4 py-2 text-right font-medium">
                  Gramos consumidos
                </th>
                <th className="px-4 py-2 text-right font-medium">Costo/g</th>
                <th className="px-4 py-2 text-right font-medium">
                  Valor aportado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(lotes ?? []).map((l) => {
                const lote = Array.isArray(l.lote) ? l.lote[0] : l.lote;
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-2 font-mono text-xs">
                      {lote?.codigo_lote ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-600">
                      {lote?.fecha_recepcion ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {l.gramos_consumidos.toLocaleString()} g
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs">
                      ${Number(l.costo_por_gramo_lote).toFixed(6)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      ${Number(l.valor_aportado).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Movimientos en kardex
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 text-right font-medium">Gramos</th>
                <th className="px-4 py-2 text-right font-medium">Cartuchos</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(movs ?? []).map((m, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-700">
                    {m.tipo}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {m.gramos !== 0 ? `${m.gramos.toLocaleString()} g` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {m.cantidad_cartuchos !== 0 ? m.cantidad_cartuchos : "—"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums font-medium ${
                      Number(m.valor_movimiento) < 0 ? "text-red-600" : ""
                    }`}
                  >
                    ${Number(m.valor_movimiento).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {enc.notas && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Notas</h2>
          <p className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600 whitespace-pre-wrap">
            {enc.notas}
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
