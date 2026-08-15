import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import ProgramarForm, { type TolvaCandidata } from "./ProgramarForm";
import CancelarButton from "./CancelarButton";

export const metadata = { title: "Sustituciones de producto · Innovaypunto" };
export const dynamic = "force-dynamic";

/** Filas de sustituciones_tolva. Tipado a mano porque la tabla es nueva y
 *  database.types.ts se regenera al aplicar la migración. */
type Emb<T> = T | T[] | null;
type FilaPendiente = {
  id: string;
  created_at: string;
  motivo: string | null;
  maquina: Emb<{ serie: string; alias: string | null }>;
  tolva: Emb<{ numero: number }>;
  saliente: Emb<{ sku: string; nombre: string }>;
  entrante: Emb<{ sku: string; nombre: string }>;
};
type FilaReciente = {
  id: string;
  ejecutada_at: string | null;
  gramos_retirados: number | null;
  gramos_recibidos: number | null;
  estado_retorno: string;
  maquina: Emb<{ serie: string; alias: string | null }>;
  tolva: Emb<{ numero: number }>;
  saliente: Emb<{ sku: string }>;
};
const uno = <T,>(v: Emb<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const RETORNO_BADGE: Record<string, { txt: string; cls: string }> = {
  sin_retorno: { txt: "sin polvo que retornar", cls: "bg-zinc-100 text-zinc-600" },
  en_transito: { txt: "polvo en tránsito", cls: "bg-amber-100 text-amber-800" },
  recibido: { txt: "recibido en almacén", cls: "bg-green-100 text-green-700" },
  rechazado: { txt: "rechazado (merma)", cls: "bg-red-100 text-red-700" },
};

export default async function SustitucionesPage({
  searchParams,
}: {
  searchParams: { producto?: string };
}) {
  await requireRole("admin", "direccion", "planeador");
  const supabase = createClient();
  const db = supabase;

  const [{ data: productos }, { data: pendientes }, { data: recientes }] =
    await Promise.all([
      supabase
        .from("productos")
        .select("id, sku, nombre")
        .eq("tipo", "polvo")
        .eq("activo", true)
        .order("nombre"),
      db
        .from("sustituciones_tolva")
        .select(
          `id, created_at, motivo,
           maquina:maquinas(serie, alias),
           tolva:tolvas(numero),
           saliente:productos!sustituciones_tolva_producto_saliente_id_fkey(sku, nombre),
           entrante:productos!sustituciones_tolva_producto_entrante_id_fkey(sku, nombre)`,
        )
        .eq("estado", "pendiente")
        .order("created_at"),
      db
        .from("sustituciones_tolva")
        .select(
          `id, ejecutada_at, gramos_retirados, gramos_recibidos, estado_retorno,
           maquina:maquinas(serie, alias),
           tolva:tolvas(numero),
           saliente:productos!sustituciones_tolva_producto_saliente_id_fkey(sku)`,
        )
        .eq("estado", "ejecutada")
        .order("ejecutada_at", { ascending: false })
        .limit(15),
    ]);

  // Candidatas: tolvas del producto elegido, con su inventario y días restantes
  const productoSel = searchParams.producto ?? "";
  let candidatas: TolvaCandidata[] = [];

  if (productoSel) {
    const { data: tolvas } = await supabase
      .from("tolvas")
      .select(
        `id, numero, inventario_actual_g, capacidad_max_g,
         maquina:maquinas!inner(id, serie, alias, activo, estado,
           ubicacion:ubicaciones(nombre, cliente:clientes(nombre)))`,
      )
      .eq("producto_id", productoSel);

    // Consumo de los últimos 14 días por tolva (para estimar días restantes)
    const pendientesTolva = new Set(
      ((pendientes ?? []) as FilaPendiente[]).map((p) => {
        const t = uno(p.tolva);
        const m = uno(p.maquina);
        return `${m?.serie}|${t?.numero}`;
      }),
    );

    candidatas = (tolvas ?? [])
      .map((t) => {
        const m = Array.isArray(t.maquina) ? t.maquina[0] : t.maquina;
        const u = m
          ? Array.isArray(m.ubicacion)
            ? m.ubicacion[0]
            : m.ubicacion
          : null;
        const c = u
          ? Array.isArray(u.cliente)
            ? u.cliente[0]
            : u.cliente
          : null;
        return {
          tolva_id: t.id,
          numero: t.numero,
          gramos: t.inventario_actual_g ?? 0,
          maquina_id: m?.id ?? "",
          maquina: m?.alias ?? m?.serie ?? "—",
          serie: m?.serie ?? "",
          ubicacion: [c?.nombre, u?.nombre].filter(Boolean).join(" · "),
          activa: !!m?.activo && m?.estado === "operativa",
          yaPendiente: pendientesTolva.has(`${m?.serie}|${t.numero}`),
        };
      })
      .filter((x) => x.activa)
      .sort((a, b) => a.gramos - b.gramos);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sustituciones de producto
        </h1>
        <p className="text-sm text-zinc-600">
          Planeación decide qué máquinas cambian de sabor. El operador no
          decide: en su visita verá la instrucción y el sistema le obligará a
          pesar el polvo retirado y cargar el producto entrante.
        </p>
      </div>

      <ProgramarForm
        productos={(productos ?? []).map((p) => ({
          id: p.id,
          sku: p.sku,
          nombre: p.nombre,
        }))}
        productoSeleccionado={productoSel}
        candidatas={candidatas}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Pendientes de ejecutar ({((pendientes ?? []) as FilaPendiente[]).length})
        </h2>
        {((pendientes ?? []) as FilaPendiente[]).length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            No hay sustituciones programadas.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Máquina</th>
                  <th className="px-3 py-2 font-medium">Tolva</th>
                  <th className="px-3 py-2 font-medium">Cambio</th>
                  <th className="px-3 py-2 font-medium">Programada</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {((pendientes ?? []) as FilaPendiente[]).map((p) => {
                  const m = uno(p.maquina);
                  const t = uno(p.tolva);
                  const sal = uno(p.saliente);
                  const ent = uno(p.entrante);
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{m?.serie}</span>
                        <div className="text-xs text-zinc-500">{m?.alias}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">#{t?.numero}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="text-red-700">{sal?.nombre}</span>
                        <span className="mx-1 text-zinc-400">→</span>
                        <span className="font-medium text-green-700">
                          {ent?.nombre}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {fmtCDMX(p.created_at, {
                          day: "2-digit",
                          month: "short",
                        })}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <CancelarButton id={p.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {((recientes ?? []) as FilaReciente[]).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Ejecutadas recientemente
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Máquina</th>
                  <th className="px-3 py-2 font-medium">Producto retirado</th>
                  <th className="px-3 py-2 text-right font-medium">Retirado</th>
                  <th className="px-3 py-2 text-right font-medium">Recibido</th>
                  <th className="px-3 py-2 font-medium">Retorno</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {((recientes ?? []) as FilaReciente[]).map((r) => {
                  const m = uno(r.maquina);
                  const t = uno(r.tolva);
                  const sal = uno(r.saliente);
                  const badge =
                    RETORNO_BADGE[r.estado_retorno] ?? RETORNO_BADGE.sin_retorno;
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{m?.serie}</span>
                        <span className="ml-1 text-xs text-zinc-500">
                          T#{t?.numero}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{sal?.sku}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {r.gramos_retirados ?? 0} g
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {r.gramos_recibidos != null ? `${r.gramos_recibidos} g` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                        >
                          {badge.txt}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {r.ejecutada_at
                          ? fmtCDMX(r.ejecutada_at, {
                              day: "2-digit",
                              month: "short",
                            })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
