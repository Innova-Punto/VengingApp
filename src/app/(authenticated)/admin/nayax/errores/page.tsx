import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMXFechaHora } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Errores Nayax · MuscleUp" };

type ErrorDetalle = {
  transaction_id: string;
  error: string;
};

type ErrorAgrupado = {
  key: string;
  patron: string;
  maquina_id: string | null;
  pa_code: string | null;
  ejemplos: string[];
  count: number;
  primer_visto: Date;
  ultimo_visto: Date;
  sugerencia: string;
};

/**
 * Intenta extraer machine_id y PA code de un mensaje de error conocido,
 * y proponer una acción concreta para Mariana.
 */
function clasificarError(msg: string): {
  patron: string;
  maquina_id: string | null;
  pa_code: string | null;
  sugerencia: string;
} {
  // Patrón típico: "Tolva con nayax_item_code A1 no encontrada en la máquina NAYAX-6880076"
  const mTolva = msg.match(
    /Tolva con nayax_item_code (\S+) no encontrada en la máquina (\S+)/,
  );
  if (mTolva) {
    return {
      patron: "Tolva sin PA Code",
      pa_code: mTolva[1],
      maquina_id: mTolva[2],
      sugerencia: `En /admin/maquinas, abre la máquina ${mTolva[2]} y escribe "${mTolva[1]}" en el campo Nayax code de la tolva correspondiente.`,
    };
  }

  // "Máquina con nayax_machine_id X no encontrada"
  const mMaq = msg.match(/Máquina con nayax_machine_id (\S+) no encontrada/);
  if (mMaq) {
    return {
      patron: "Máquina no encontrada",
      pa_code: null,
      maquina_id: mMaq[1],
      sugerencia: `Esa máquina Nayax (${mMaq[1]}) no existe localmente o está inactiva. Importa desde /admin/nayax/sincronizar o reactiva la máquina.`,
    };
  }

  // "Tolva X no tiene gramaje_servicio configurado"
  const mGram = msg.match(/Tolva (\S+) no tiene gramaje_servicio/);
  if (mGram) {
    return {
      patron: "Tolva sin gramaje",
      pa_code: null,
      maquina_id: null,
      sugerencia: `La tolva (id ${mGram[1]}) tiene producto pero sin gramaje. Edítala en /admin/maquinas y pon los gramos por porción.`,
    };
  }

  // "Producto sin PA Code"
  if (msg.includes("Producto sin PA Code")) {
    return {
      patron: "SQS sin PA Code",
      pa_code: null,
      maquina_id: null,
      sugerencia:
        "El mensaje SQS llegó sin PA Code. Suele ser un evento de máquina (no de venta). No requiere acción.",
    };
  }

  return {
    patron: msg.slice(0, 80),
    pa_code: null,
    maquina_id: null,
    sugerencia: "Revisar manualmente.",
  };
}

export default async function ErroresNayaxPage() {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  // Últimos 100 sync logs con errores
  const { data: logs } = await supabase
    .from("nayax_sync_log")
    .select("id, inicio, errores, mensaje_error")
    .gt("errores", 0)
    .order("inicio", { ascending: false })
    .limit(100);

  // Aplana todos los errores y agrupa por patrón + máquina + PA code
  const grupos = new Map<string, ErrorAgrupado>();
  let totalErrores = 0;

  for (const log of logs ?? []) {
    if (!log.mensaje_error) continue;
    let detalles: ErrorDetalle[] = [];
    try {
      const parsed = JSON.parse(log.mensaje_error);
      if (Array.isArray(parsed)) detalles = parsed as ErrorDetalle[];
    } catch {
      continue;
    }

    const ts = new Date(log.inicio);
    for (const d of detalles) {
      totalErrores += 1;
      const c = clasificarError(d.error);
      const key = `${c.patron}|${c.maquina_id ?? ""}|${c.pa_code ?? ""}`;
      const g = grupos.get(key) ?? {
        key,
        patron: c.patron,
        maquina_id: c.maquina_id,
        pa_code: c.pa_code,
        ejemplos: [],
        count: 0,
        primer_visto: ts,
        ultimo_visto: ts,
        sugerencia: c.sugerencia,
      };
      g.count += 1;
      if (ts < g.primer_visto) g.primer_visto = ts;
      if (ts > g.ultimo_visto) g.ultimo_visto = ts;
      if (g.ejemplos.length < 3) g.ejemplos.push(d.transaction_id);
      grupos.set(key, g);
    }
  }

  const grupos_arr = Array.from(grupos.values()).sort(
    (a, b) => b.count - a.count,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Errores de ingesta Nayax
          </h1>
          <p className="text-sm text-zinc-600">
            Ventas que llegaron de Nayax pero no se pudieron procesar.
            Agrupadas por causa para que sea evidente qué configurar.
          </p>
        </div>
        <Link
          href="/admin/nayax"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          ← Volver a Nayax
        </Link>
      </div>

      <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p>
          <strong>Importante:</strong> los errores aquí mostrados NO son
          ventas perdidas — los mensajes SQS quedan en cola y se reintentan
          automáticamente. En cuanto arregles la configuración (ej. agregues
          el PA Code que falta), el siguiente reintento procesa la venta.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="Errores únicos"
          value={grupos_arr.length.toLocaleString("es-MX")}
        />
        <Stat
          label="Total ocurrencias"
          value={totalErrores.toLocaleString("es-MX")}
        />
        <Stat
          label="Sync logs revisados"
          value={(logs ?? []).length.toLocaleString("es-MX")}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Causas agrupadas
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Causa</th>
                <th className="px-3 py-2 font-medium">Máquina Nayax</th>
                <th className="px-3 py-2 font-medium">PA Code</th>
                <th className="px-3 py-2 text-right font-medium">Ocurrencias</th>
                <th className="px-3 py-2 font-medium">Último visto</th>
                <th className="px-3 py-2 font-medium">Qué hacer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {grupos_arr.map((g) => (
                <tr key={g.key} className="align-top">
                  <td className="px-3 py-2">
                    <div className="text-xs font-medium text-red-700">
                      {g.patron}
                    </div>
                    {g.ejemplos.length > 0 && (
                      <div className="mt-0.5 font-mono text-[10px] text-zinc-400">
                        ej. {g.ejemplos.slice(0, 2).join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {g.maquina_id ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {g.pa_code ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-700">
                    {g.count}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {fmtCDMXFechaHora(g.ultimo_visto)}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-700">
                    {g.sugerencia}
                  </td>
                </tr>
              ))}
              {grupos_arr.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-zinc-500"
                  >
                    Sin errores recientes. Todo procesando OK.
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
        {value}
      </div>
    </div>
  );
}
