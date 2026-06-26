import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import DevolucionRow from "./DevolucionRow";

export const metadata = { title: "Devoluciones · Innovaypunto" };

const ESTADO_BADGE: Record<string, string> = {
  pendiente_devolucion: "bg-amber-100 text-amber-700",
  recibida_ok: "bg-green-100 text-green-700",
  recibida_con_diferencia: "bg-red-100 text-red-700",
};

export default async function DevolucionesPage() {
  await requireRole("admin", "direccion", "almacen", "planeador");
  const supabase = createClient();

  const { data: pendientes } = await supabase
    .from("devoluciones_almacen")
    .select(
      `id, cantidad_calculada, estado, created_at, operador_id, notas,
       producto:productos(sku, nombre),
       operador:profiles!devoluciones_almacen_operador_id_fkey(full_name),
       llenado_item:llenado_items!devoluciones_almacen_llenado_item_id_fkey(
         id,
         llenado:llenados(
           fecha,
           maquina:maquinas(serie, alias)
         )
       ),
       maquina_directa:maquinas!devoluciones_almacen_maquina_id_fkey(serie, alias),
       asignacion:asignaciones_diarias!devoluciones_almacen_asignacion_id_fkey(
         fecha, estado, motivo_cierre_incompleto
       )`,
    )
    .eq("estado", "pendiente_devolucion")
    .order("created_at", { ascending: false });

  const { data: historico } = await supabase
    .from("devoluciones_almacen")
    .select(
      `id, cantidad_calculada, cantidad_recibida_almacen, estado, fecha_recepcion,
       producto:productos(sku, nombre),
       operador:profiles!devoluciones_almacen_operador_id_fkey(full_name),
       recibida_por_user:profiles!devoluciones_almacen_recibida_por_fkey(full_name),
       incidencia:incidencias(folio)`,
    )
    .neq("estado", "pendiente_devolucion")
    .order("fecha_recepcion", { ascending: false })
    .limit(30);

  const pendientesList = pendientes ?? [];
  type Pend = (typeof pendientesList)[number];
  const grupos = new Map<
    string,
    {
      operadorNombre: string;
      fecha: string;
      maquinaLabel: string;
      origen: "llenado" | "no_visitada";
      motivo: string | null;
      items: Pend[];
    }
  >();
  for (const d of pendientesList) {
    const op = Array.isArray(d.operador) ? d.operador[0] : d.operador;
    const li = Array.isArray(d.llenado_item) ? d.llenado_item[0] : d.llenado_item;
    const lle = li
      ? Array.isArray(li.llenado)
        ? li.llenado[0]
        : li.llenado
      : null;
    const maqLlenado = lle
      ? Array.isArray(lle.maquina)
        ? lle.maquina[0]
        : lle.maquina
      : null;
    const maqDirecta = Array.isArray(d.maquina_directa)
      ? d.maquina_directa[0]
      : d.maquina_directa;
    const asig = Array.isArray(d.asignacion) ? d.asignacion[0] : d.asignacion;
    const maq = maqLlenado ?? maqDirecta;
    const origen: "llenado" | "no_visitada" = li ? "llenado" : "no_visitada";
    const fechaDevol = lle?.fecha
      ? lle.fecha.slice(0, 10)
      : asig?.fecha ?? d.created_at.slice(0, 10);
    const key = `${d.operador_id}|${fechaDevol}|${maq?.serie ?? ""}|${origen}`;
    const grupo = grupos.get(key) ?? {
      operadorNombre: op?.full_name ?? "(sin operador)",
      fecha: fechaDevol,
      maquinaLabel: maq ? `${maq.serie}${maq.alias ? " · " + maq.alias : ""}` : "—",
      origen,
      motivo: origen === "no_visitada" ? asig?.motivo_cierre_incompleto ?? null : null,
      items: [] as Pend[],
    };
    grupo.items.push(d);
    grupos.set(key, grupo);
  }

  const totalPendientes = (pendientes ?? []).length;
  const totalCartuchos = (pendientes ?? []).reduce(
    (s, d) => s + (d.cantidad_calculada ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Devoluciones</h1>
        <p className="text-sm text-zinc-600">
          Cartuchos no usados en campo que regresan al almacén. Si la cantidad
          recibida no coincide con la calculada se dispara una incidencia
          automática.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Stat label="Devoluciones pendientes" value={String(totalPendientes)} />
        <Stat label="Cartuchos por recibir" value={String(totalCartuchos)} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Pendientes</h2>

        {grupos.size === 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
            No hay devoluciones pendientes.
          </div>
        )}

        {Array.from(grupos.entries()).map(([key, g]) => (
          <div
            key={key}
            className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
          >
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm font-medium text-zinc-900">
                  {g.operadorNombre}
                </div>
                {g.origen === "no_visitada" && (
                  <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                    Máquina no visitada{g.motivo ? ` · ${g.motivo}` : ""}
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-500">
                {g.fecha} · {g.maquinaLabel}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Calculado
                  </th>
                  <th className="px-3 py-2 font-medium" colSpan={2}>
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {g.items.map((d) => {
                  const prod = Array.isArray(d.producto)
                    ? d.producto[0]
                    : d.producto;
                  return (
                    <DevolucionRow
                      key={d.id}
                      id={d.id}
                      cantidadCalculada={d.cantidad_calculada ?? 0}
                      productoSku={prod?.sku ?? "—"}
                      productoNombre={prod?.nombre ?? "—"}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Histórico reciente</h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Operador</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Calc.</th>
                <th className="px-3 py-2 text-right font-medium">Recib.</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Incidencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(historico ?? []).map((d) => {
                const prod = Array.isArray(d.producto)
                  ? d.producto[0]
                  : d.producto;
                const op = Array.isArray(d.operador) ? d.operador[0] : d.operador;
                const inc = Array.isArray(d.incidencia)
                  ? d.incidencia[0]
                  : d.incidencia;
                return (
                  <tr key={d.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 text-zinc-600">
                      {d.fecha_recepcion
                        ? fmtCDMX(d.fecha_recepcion, { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">
                      {op?.full_name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{prod?.nombre}</div>
                      <div className="font-mono text-xs text-zinc-500">
                        {prod?.sku}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {d.cantidad_calculada}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {d.cantidad_recibida_almacen ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          ESTADO_BADGE[d.estado] ?? "bg-zinc-100"
                        }`}
                      >
                        {d.estado.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {inc?.folio ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {(historico ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-zinc-500"
                  >
                    Aún no hay devoluciones procesadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">
          <Link href="/almacen/inventario" className="underline">
            Ver inventario
          </Link>
        </p>
      </section>
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
