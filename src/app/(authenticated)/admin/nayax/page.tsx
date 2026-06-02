import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Nayax · MuscleUp" };

export default async function NayaxPage() {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const [{ data: logs }, { data: ventas }, { data: stats }] = await Promise.all([
    supabase
      .from("nayax_sync_log")
      .select(
        `id, inicio, fin, duracion_seg, transacciones_jaladas,
         transacciones_nuevas, transacciones_duplicadas, errores, estado,
         mensaje_error`,
      )
      .order("inicio", { ascending: false })
      .limit(20),
    supabase
      .from("ventas_maquina")
      .select(
        `id, nayax_transaction_id, fecha_transaccion, gramos_dispensados,
         precio_bruto, precio_neto, utilidad_bruta, margen_porcentaje,
         metodo_pago,
         maquina:maquinas(serie, alias),
         producto:productos(sku, nombre),
         tolva:tolvas(numero)`,
      )
      .order("fecha_transaccion", { ascending: false })
      .limit(50),
    supabase
      .from("ventas_maquina")
      .select("precio_neto, utilidad_bruta, gramos_dispensados, fecha_transaccion")
      .gte(
        "fecha_transaccion",
        new Date(Date.now() - 30 * 86400000).toISOString(),
      ),
  ]);

  // Stats últimos 30 días
  let ingresos30d = 0;
  let utilidad30d = 0;
  let gramos30d = 0;
  let nVentas30d = 0;
  for (const v of stats ?? []) {
    ingresos30d += Number(v.precio_neto ?? 0);
    utilidad30d += Number(v.utilidad_bruta ?? 0);
    gramos30d += v.gramos_dispensados ?? 0;
    nVentas30d += 1;
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nayax</h1>
          <p className="text-sm text-zinc-600">
            Ingesta de ventas desde Nayax. Cada venta descuenta el inventario
            de la tolva, calcula utilidad y registra kardex.
          </p>
        </div>
        <Link
          href="/admin/nayax/sincronizar"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Sincronizar con Nayax →
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ventas 30d" value={nVentas30d.toLocaleString("es-MX")} />
        <Stat
          label="Ingresos netos 30d"
          value={`$${ingresos30d.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <Stat
          label="Utilidad 30d"
          value={`$${utilidad30d.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          tone="green"
        />
        <Stat
          label="Gramos 30d"
          value={`${(gramos30d / 1000).toFixed(1)} kg`}
        />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Configuración</h2>
        <p className="mt-2 text-xs text-zinc-600">
          La ingesta es por <strong>Amazon SQS</strong>. Nayax publica cada
          transacción en una cola; un cron de Vercel la consume cada 2
          minutos en <code className="rounded bg-zinc-100 px-1">/api/nayax/poll</code>.
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-zinc-600">
          <li>
            Identificador único: <code>{"{TransactionId}-{PA Code}"}</code>{" "}
            (soporta multivend).
          </li>
          <li>
            Los mensajes con <code>Void = true</code> se descartan (no se
            procesa cancelación todavía).
          </li>
          <li>
            Si una transacción falla, el mensaje queda en la cola y se
            reintenta automáticamente.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Sync log</h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Inicio</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium">Jaladas</th>
                <th className="px-3 py-2 text-right font-medium">Nuevas</th>
                <th className="px-3 py-2 text-right font-medium">Dup.</th>
                <th className="px-3 py-2 text-right font-medium">Errores</th>
                <th className="px-3 py-2 text-right font-medium">Dur.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(logs ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 text-xs text-zinc-700">
                    {new Date(l.inicio).toLocaleString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        l.estado === "ok"
                          ? "bg-green-100 text-green-700"
                          : l.estado === "con_errores"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {l.estado ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.transacciones_jaladas}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-green-700">
                    {l.transacciones_nuevas}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {l.transacciones_duplicadas}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-700">
                    {l.errores}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-500">
                    {l.duracion_seg ?? "—"}s
                  </td>
                </tr>
              ))}
              {(logs ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                    Aún no hay syncs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Últimas ventas
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Máquina</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">g</th>
                <th className="px-3 py-2 text-right font-medium">Neto</th>
                <th className="px-3 py-2 text-right font-medium">Util.</th>
                <th className="px-3 py-2 text-right font-medium">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(ventas ?? []).map((v) => {
                const maq = Array.isArray(v.maquina) ? v.maquina[0] : v.maquina;
                const prod = Array.isArray(v.producto)
                  ? v.producto[0]
                  : v.producto;
                const tol = Array.isArray(v.tolva) ? v.tolva[0] : v.tolva;
                return (
                  <tr key={v.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 text-xs text-zinc-700">
                      {new Date(v.fecha_transaccion).toLocaleString("es-MX", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs">{maq?.serie}</div>
                      {maq?.alias && (
                        <div className="text-xs text-zinc-500">{maq.alias}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-xs">{prod?.nombre}</div>
                      <div className="font-mono text-[10px] text-zinc-500">
                        {prod?.sku} · tolva #{tol?.numero}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      {v.gramos_dispensados}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      ${Number(v.precio_neto).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        Number(v.utilidad_bruta) < 0
                          ? "text-red-700"
                          : "text-green-700"
                      }`}
                    >
                      ${Number(v.utilidad_bruta).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-500">
                      {v.margen_porcentaje != null
                        ? `${v.margen_porcentaje}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
              {(ventas ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                    Aún no hay ventas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "zinc";
}) {
  const color = tone === "green" ? "text-green-700" : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
