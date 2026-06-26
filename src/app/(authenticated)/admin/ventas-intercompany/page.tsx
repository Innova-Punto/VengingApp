import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ventas intercompany · Innovaypunto" };

function fmtMXN(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function VentasIntercompanyPage() {
  await requireRole("admin", "direccion", "almacen");
  const supabase = createClient();

  const { data: ventas } = await supabase
    .from("ventas_intercompany")
    .select(
      `id, folio, fecha, presentacion, cantidad,
       costo_unitario_snapshot, costo_total,
       margen_porcentaje, precio_venta_neto, utilidad, notas,
       empresa:clientes!ventas_intercompany_empresa_destino_id_fkey(nombre),
       producto:productos(sku, nombre, tipo),
       usuario:profiles!ventas_intercompany_usuario_id_fkey(full_name)`,
    )
    .order("fecha", { ascending: false })
    .limit(100);

  const filas = ventas ?? [];
  const totalCosto = filas.reduce((s, v) => s + Number(v.costo_total ?? 0), 0);
  const totalVenta = filas.reduce(
    (s, v) => s + Number(v.precio_venta_neto ?? 0),
    0,
  );
  const totalUtilidad = filas.reduce((s, v) => s + Number(v.utilidad ?? 0), 0);
  const margenGlobal =
    totalVenta > 0 ? (totalUtilidad / totalVenta) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ventas intercompany
          </h1>
          <p className="text-sm text-zinc-600">
            Salidas de inventario hacia otras empresas del grupo. No factura
            externamente — registro interno para utilidad e inventario.
          </p>
        </div>
        <Link
          href="/admin/ventas-intercompany/nueva"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
        >
          Nueva venta
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ventas" value={String(filas.length)} />
        <Stat label="Costo total" value={fmtMXN(totalCosto)} />
        <Stat label="Venta total" value={fmtMXN(totalVenta)} />
        <Stat
          label="Utilidad / Margen"
          value={`${fmtMXN(totalUtilidad)} · ${margenGlobal.toFixed(1)}%`}
        />
      </section>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Folio</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Empresa</th>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-right font-medium">Costo</th>
              <th className="px-3 py-2 text-right font-medium">Margen</th>
              <th className="px-3 py-2 text-right font-medium">Venta</th>
              <th className="px-3 py-2 text-right font-medium">Utilidad</th>
              <th className="px-3 py-2 font-medium">Por</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filas.map((v) => {
              const empresa = Array.isArray(v.empresa)
                ? v.empresa[0]
                : v.empresa;
              const producto = Array.isArray(v.producto)
                ? v.producto[0]
                : v.producto;
              const usuario = Array.isArray(v.usuario)
                ? v.usuario[0]
                : v.usuario;
              return (
                <tr key={v.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-2 font-mono text-xs">{v.folio}</td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {fmtCDMX(v.fecha, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {empresa?.nombre ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">
                      {producto?.nombre}
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500">
                      {producto?.sku}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {v.cantidad}
                    <span className="text-zinc-400">
                      {v.presentacion === "granel" ? " g" : " vasos"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700">
                    {fmtMXN(v.costo_total)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {Number(v.margen_porcentaje).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtMXN(v.precio_venta_neto)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-green-700">
                    {fmtMXN(v.utilidad)}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {usuario?.full_name ?? "—"}
                  </td>
                </tr>
              );
            })}
            {filas.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-sm text-zinc-500"
                >
                  Aún no hay ventas intercompany registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
        {value}
      </div>
    </div>
  );
}
