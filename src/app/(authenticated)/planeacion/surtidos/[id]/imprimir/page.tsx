import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import BotonImprimir from "./BotonImprimir";

export const metadata = { title: "Packing list · MuscleUp" };

export default async function PackingListPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion", "planeador", "almacen");

  const supabase = createClient();

  const { data: surt } = await supabase
    .from("surtidos")
    .select(
      `id, folio, fecha, estado,
       asignacion:asignaciones_diarias!surtidos_asignacion_id_fkey(
         fecha,
         ruta:rutas(nombre),
         operador:profiles!asignaciones_diarias_operador_id_fkey(full_name)
       )`,
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!surt) notFound();

  const asig = Array.isArray(surt.asignacion)
    ? surt.asignacion[0]
    : surt.asignacion;
  const ruta = asig ? (Array.isArray(asig.ruta) ? asig.ruta[0] : asig.ruta) : null;
  const op = asig
    ? Array.isArray(asig.operador)
      ? asig.operador[0]
      : asig.operador
    : null;

  const { data: items } = await supabase
    .from("surtido_items")
    .select(
      `id, maquina_id, cartuchos_entregados, vasos_entregados,
       producto:productos(sku, nombre, tipo, gramaje_cartucho_default),
       maquina:maquinas(
         serie, alias,
         ubicacion:ubicaciones(nombre, cliente:clientes(nombre))
       )`,
    )
    .eq("surtido_id", params.id);

  type ItemRow = NonNullable<typeof items>[number];
  const porMaquina = new Map<string, ItemRow[]>();
  for (const it of items ?? []) {
    const arr = porMaquina.get(it.maquina_id) ?? [];
    arr.push(it);
    porMaquina.set(it.maquina_id, arr);
  }

  let totalCartuchos = 0;
  let totalVasos = 0;
  for (const it of items ?? []) {
    totalCartuchos += it.cartuchos_entregados ?? 0;
    totalVasos += it.vasos_entregados ?? 0;
  }

  return (
    <>
      <style>{`
        @media print {
          header { display: none !important; }
          main { max-width: none !important; padding: 0 !important; }
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { page-break-after: always; }
          .print-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl space-y-6 print:space-y-4">
        <div className="no-print flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            Packing list · {surt.folio}
          </h1>
          <BotonImprimir />
        </div>

        <div className="border-b border-zinc-300 pb-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-2xl font-semibold">{surt.folio}</h2>
            <span className="text-sm text-zinc-600">
              Generado: {fmtCDMX(new Date())}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-700">
            <strong>Ruta:</strong> {ruta?.nombre ?? "—"} ·{" "}
            <strong>Operador:</strong> {op?.full_name ?? "—"} ·{" "}
            <strong>Fecha asignación:</strong> {asig?.fecha ?? "—"}
          </p>
        </div>

        <div className="rounded border border-zinc-300 p-3 text-sm">
          <div className="flex justify-around">
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Total cartuchos
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {totalCartuchos}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Total vasos
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {totalVasos}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Máquinas
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {porMaquina.size}
              </div>
            </div>
          </div>
        </div>

        {Array.from(porMaquina.entries()).map(([maquinaId, rows]) => {
          const primera = rows[0];
          const m = primera
            ? Array.isArray(primera.maquina)
              ? primera.maquina[0]
              : primera.maquina
            : null;
          const ubic = m
            ? Array.isArray(m.ubicacion)
              ? m.ubicacion[0]
              : m.ubicacion
            : null;
          const cliente = ubic
            ? Array.isArray(ubic.cliente)
              ? ubic.cliente[0]
              : ubic.cliente
            : null;

          let subCart = 0;
          let subVaso = 0;
          for (const it of rows) {
            subCart += it.cartuchos_entregados ?? 0;
            subVaso += it.vasos_entregados ?? 0;
          }

          return (
            <div
              key={maquinaId}
              className="rounded border border-zinc-300 print-page"
            >
              <div className="border-b border-zinc-300 bg-zinc-50 px-3 py-2">
                <div className="font-mono text-sm font-semibold">
                  {m?.serie ?? "—"}
                </div>
                {m?.alias && (
                  <div className="text-xs text-zinc-600">{m.alias}</div>
                )}
                {(cliente || ubic) && (
                  <div className="text-xs text-zinc-600">
                    {cliente?.nombre ?? "—"} · {ubic?.nombre ?? "—"}
                  </div>
                )}
              </div>

              <table className="w-full text-sm">
                <thead className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-600">
                  <tr>
                    <th className="px-3 py-1 font-medium">Producto</th>
                    <th className="px-3 py-1 text-right font-medium">
                      Cartuchos
                    </th>
                    <th className="px-3 py-1 text-right font-medium">Vasos</th>
                    <th className="px-3 py-1 text-center font-medium w-12">
                      ✓
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {rows.map((it) => {
                    const prod = Array.isArray(it.producto)
                      ? it.producto[0]
                      : it.producto;
                    return (
                      <tr key={it.id}>
                        <td className="px-3 py-1">
                          <div className="font-medium">{prod?.nombre ?? "—"}</div>
                          <div className="font-mono text-xs text-zinc-500">
                            {prod?.sku ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          {prod?.tipo === "polvo" ? it.cartuchos_entregados : "—"}
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          {prod?.tipo === "vaso" ? it.vasos_entregados : "—"}
                        </td>
                        <td className="px-3 py-1 text-center text-zinc-300">
                          ☐
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-zinc-50 font-medium">
                    <td className="px-3 py-1 text-right">Subtotal</td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {subCart}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {subVaso}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}

        {porMaquina.size === 0 && (
          <p className="text-center text-sm text-zinc-500">
            Este surtido no tiene items.
          </p>
        )}

        <div className="border-t border-zinc-300 pt-4 text-xs text-zinc-600">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="mb-8">Entrega almacén:</div>
              <div className="border-t border-zinc-400 pt-1 text-center">
                Firma
              </div>
            </div>
            <div>
              <div className="mb-8">Recibe operador:</div>
              <div className="border-t border-zinc-400 pt-1 text-center">
                Firma
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
