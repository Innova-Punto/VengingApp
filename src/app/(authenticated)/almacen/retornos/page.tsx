import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import RecibirForm, { type RetornoPendiente } from "./RecibirForm";

export const metadata = { title: "Retornos de polvo · Innovaypunto" };
export const dynamic = "force-dynamic";

/** Filas de sustituciones_tolva (tabla nueva; los tipos generados se
 *  actualizan al aplicar la migración). */
type Emb<T> = T | T[] | null;
type FilaTransito = {
  id: string;
  ejecutada_at: string | null;
  gramos_retirados: number | null;
  costo_por_gramo_retiro: number | string | null;
  foto_retiro_url: string | null;
  notas_operador: string | null;
  maquina: Emb<{ serie: string; alias: string | null }>;
  tolva: Emb<{ numero: number }>;
  saliente: Emb<{ sku: string; nombre: string }>;
  operador: Emb<{ full_name: string | null }>;
};
type FilaHistorial = {
  id: string;
  recibido_at: string | null;
  gramos_retirados: number | null;
  gramos_recibidos: number | null;
  estado_retorno: string;
  motivo_rechazo: string | null;
  maquina: Emb<{ serie: string }>;
  saliente: Emb<{ sku: string }>;
  lote: Emb<{ codigo_lote: string }>;
};
const uno = <T,>(v: Emb<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function RetornosPage() {
  await requireRole("admin", "direccion", "almacen");
  const supabase = createClient();
  // La migración de sustituciones aún no está en los tipos generados; se quita
  // el `any` tras aplicarla y correr `npm run db:types`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [{ data: enTransito }, { data: historial }] = await Promise.all([
    db
      .from("sustituciones_tolva")
      .select(
        `id, ejecutada_at, gramos_retirados, costo_por_gramo_retiro,
         foto_retiro_url, notas_operador,
         maquina:maquinas(serie, alias),
         tolva:tolvas(numero),
         saliente:productos!sustituciones_tolva_producto_saliente_id_fkey(sku, nombre),
         operador:profiles!sustituciones_tolva_ejecutada_por_fkey(full_name)`,
      )
      .eq("estado_retorno", "en_transito")
      .order("ejecutada_at"),
    db
      .from("sustituciones_tolva")
      .select(
        `id, recibido_at, gramos_retirados, gramos_recibidos, estado_retorno,
         motivo_rechazo,
         maquina:maquinas(serie),
         saliente:productos!sustituciones_tolva_producto_saliente_id_fkey(sku),
         lote:lotes!sustituciones_tolva_lote_retorno_id_fkey(codigo_lote)`,
      )
      .in("estado_retorno", ["recibido", "rechazado"])
      .order("recibido_at", { ascending: false })
      .limit(20),
  ]);

  const pendientes: RetornoPendiente[] = ((enTransito ?? []) as FilaTransito[]).map((r) => {
    const m = uno(r.maquina);
    const t = uno(r.tolva);
    const p = uno(r.saliente);
    const op = uno(r.operador);
    return {
      id: r.id,
      maquina: `${m?.serie ?? ""} ${m?.alias ?? ""}`.trim(),
      tolva: t?.numero ?? 0,
      producto: `${p?.sku ?? ""} · ${p?.nombre ?? ""}`,
      gramos_retirados: r.gramos_retirados ?? 0,
      valor: Math.round(
        (r.gramos_retirados ?? 0) * Number(r.costo_por_gramo_retiro ?? 0) * 100,
      ) / 100,
      fecha: r.ejecutada_at,
      operador: op?.full_name ?? "—",
      notas: r.notas_operador,
    };
  });

  const totalG = pendientes.reduce((s, p) => s + p.gramos_retirados, 0);
  const totalV = pendientes.reduce((s, p) => s + p.valor, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Retornos de polvo
        </h1>
        <p className="text-sm text-zinc-600">
          Polvo retirado de tolvas por cambio de sabor. Inspecciona cada bolsa:
          si viene en buen estado se recibe y nace un <strong>lote
          recuperado</strong> listo para encartuchar; si no, se rechaza y se
          registra como merma.
        </p>
      </div>

      {pendientes.length > 0 && (
        <section className="grid grid-cols-3 gap-3">
          <Stat label="Bolsas por revisar" value={String(pendientes.length)} />
          <Stat
            label="Polvo en tránsito"
            value={`${totalG.toLocaleString("es-MX")} g`}
          />
          <Stat
            label="Valor"
            value={`$${totalV.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
        </section>
      )}

      <section className="space-y-3">
        {pendientes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            No hay polvo en tránsito. Cuando un operador ejecute un cambio de
            sabor, la bolsa aparecerá aquí para su revisión.
          </p>
        ) : (
          pendientes.map((r) => <RecibirForm key={r.id} retorno={r} />)
        )}
      </section>

      {(historial ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Historial
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Máquina</th>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Retirado</th>
                  <th className="px-3 py-2 text-right font-medium">Recibido</th>
                  <th className="px-3 py-2 font-medium">Resultado</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {((historial ?? []) as FilaHistorial[]).map((h) => {
                  const m = uno(h.maquina);
                  const p = uno(h.saliente);
                  const l = uno(h.lote);
                  const ok = h.estado_retorno === "recibido";
                  return (
                    <tr key={h.id}>
                      <td className="px-3 py-2 font-mono text-xs">{m?.serie}</td>
                      <td className="px-3 py-2 font-mono text-xs">{p?.sku}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {h.gramos_retirados ?? 0} g
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {h.gramos_recibidos ?? 0} g
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {ok ? (
                          <span className="text-green-700">
                            ✓ {l?.codigo_lote ?? "recibido"}
                          </span>
                        ) : (
                          <span className="text-red-700">
                            ✗ merma — {h.motivo_rechazo}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {h.recibido_at
                          ? fmtCDMX(h.recibido_at, {
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
