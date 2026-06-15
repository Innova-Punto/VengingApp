import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Encartuchados · MuscleUp" };

export default async function EncartuchadosPage() {
  await requireRole("admin", "direccion", "almacen");

  const supabase = createClient();
  const { data: encs, error } = await supabase
    .from("encartuchados")
    .select(
      `id, folio, fecha, cartuchos_producidos, cantidad_disponible,
       gramos_totales_consumidos, gramos_merma, costo_promedio_g,
       producto:productos(sku, nombre)`,
    )
    .order("fecha", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Encartuchados
          </h1>
          <p className="text-sm text-zinc-600">
            Producción de cartuchos de polvo a partir del granel disponible
            (PEPS).
          </p>
        </div>
        <Link
          href="/almacen/encartuchados/nuevo"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
        >
          Nueva producción
        </Link>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Error: {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Folio</th>
              <th className="px-4 py-2 font-medium">Producto</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 text-right font-medium">Producidos</th>
              <th className="px-4 py-2 text-right font-medium">Disponibles</th>
              <th className="px-4 py-2 text-right font-medium">Gramos cons.</th>
              <th className="px-4 py-2 text-right font-medium">Merma</th>
              <th className="px-4 py-2 text-right font-medium">Costo/g prom.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(encs ?? []).map((e) => {
              const prod = Array.isArray(e.producto)
                ? e.producto[0]
                : e.producto;
              return (
                <tr key={e.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-mono text-xs font-medium">
                    <Link
                      href={`/almacen/encartuchados/${e.id}`}
                      className="hover:underline"
                    >
                      {e.folio}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-700">
                    {prod?.nombre ?? "—"}
                    <div className="font-mono text-xs text-zinc-500">
                      {prod?.sku ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-xs text-zinc-600">
                    {fmtCDMX(e.fecha, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {e.cartuchos_producidos}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {e.cantidad_disponible}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs text-zinc-600">
                    {e.gramos_totales_consumidos.toLocaleString()} g
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs text-zinc-600">
                    {e.gramos_merma > 0 ? `${e.gramos_merma} g` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs">
                    ${Number(e.costo_promedio_g).toFixed(6)}
                  </td>
                </tr>
              );
            })}
            {(encs ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  Aún no hay producciones de encartuchado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
