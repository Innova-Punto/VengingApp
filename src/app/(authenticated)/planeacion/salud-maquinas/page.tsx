import { BannerMaquinasRevisar } from "@/components/BannerMaquinasRevisar";
import { requireRole } from "@/lib/auth";
import { fmtCDMXFechaHora } from "@/lib/datetime";
import { UMBRAL_HORAS, filtrarRevisar } from "@/lib/salud-maquinas";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Salud de máquinas · Innovaypunto" };
export const dynamic = "force-dynamic";

type Fila = {
  maquina_id: string;
  serie: string | null;
  alias: string | null;
  ubicacion: string | null;
  cliente: string | null;
  servicios_ayer: number;
  monto_ayer: number | string;
  serv_mes_actual: number;
  prom_dia_actual: number | string;
  serv_mes_pasado: number;
  prom_dia_pasado: number | string;
  ultima_venta: string | null;
  activa: boolean;
  horas_op_sin_venta: number | string;
  abierta_ahora: boolean;
  ruta_id: string | null;
  ruta_nombre: string | null;
  operador_id: string | null;
  operador_nombre: string | null;
};

function fmtMxn(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function horasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export default async function SaludMaquinasPage({
  searchParams,
}: {
  searchParams: { ruta?: string; operador?: string };
}) {
  await requireRole("admin", "direccion", "planeador", "almacen");
  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("reporte_ventas_maquinas");
  const todas: Fila[] = ((data as Fila[]) ?? [])
    .slice()
    .sort(
      (a, b) => Number(b.horas_op_sin_venta) - Number(a.horas_op_sin_venta),
    );

  // Opciones de filtro (distintas rutas y operadores presentes)
  const rutasOpts = Array.from(
    new Map(
      todas.filter((f) => f.ruta_id).map((f) => [f.ruta_id, f.ruta_nombre]),
    ),
  ).sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? ""));
  const operadoresOpts = Array.from(
    new Map(
      todas
        .filter((f) => f.operador_id)
        .map((f) => [f.operador_id, f.operador_nombre]),
    ),
  ).sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? ""));

  const rutaSel = searchParams.ruta ?? "";
  const operadorSel = searchParams.operador ?? "";
  const filas = todas.filter(
    (f) =>
      (!rutaSel || f.ruta_id === rutaSel) &&
      (!operadorSel || f.operador_id === operadorSel),
  );

  const totServ = filas.reduce((s, f) => s + f.servicios_ayer, 0);
  const totMonto = filas.reduce((s, f) => s + Number(f.monto_ayer), 0);
  const sinVenta = filas.filter((f) => f.servicios_ayer === 0).length;
  const proDia =
    filas.length > 0 ? totServ / filas.length : 0;

  // Máquinas que planeación DEBE revisar: sin vender ≥12 h en horario de operación.
  const revisar = filtrarRevisar(filas);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Salud de máquinas · Ventas
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Venta de <strong>ayer</strong> por máquina vs. su promedio diario del
          mes en curso y del mes pasado. Ordenadas de <strong>mayor a menor por
          horas sin venta (en operación)</strong>: las que llevan más tiempo sin
          vender aparecen hasta arriba.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Error al cargar el reporte: {error.message}
        </div>
      )}

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Ruta
          </label>
          <select
            name="ruta"
            defaultValue={rutaSel}
            className="mt-1 w-52 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="">Todas las rutas</option>
            {rutasOpts.map(([id, nombre]) => (
              <option key={id} value={id ?? ""}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Operador
          </label>
          <select
            name="operador"
            defaultValue={operadorSel}
            className="mt-1 w-52 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="">Todos los operadores</option>
            {operadoresOpts.map(([id, nombre]) => (
              <option key={id} value={id ?? ""}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
        >
          Filtrar
        </button>
        {(rutaSel || operadorSel) && (
          <a
            href="/planeacion/salud-maquinas"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Limpiar
          </a>
        )}
        <span className="ml-auto self-center text-xs text-zinc-500">
          {filas.length} de {todas.length} máquinas
        </span>
      </form>

      <BannerMaquinasRevisar items={revisar} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat
          label="Requieren revisión"
          value={revisar.length.toLocaleString("es-MX")}
          tone={revisar.length > 0 ? "red" : "green"}
        />
        <Stat label="Máquinas activas" value={filas.length.toLocaleString("es-MX")} />
        <Stat
          label="Sin venta ayer"
          value={sinVenta.toLocaleString("es-MX")}
          tone={sinVenta > 0 ? "red" : "zinc"}
        />
        <Stat label="Servicios ayer" value={totServ.toLocaleString("es-MX")} />
        <Stat label="Venta ayer" value={fmtMxn(totMonto)} tone="green" />
      </section>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Máquina</th>
              <th className="px-3 py-2 text-right font-medium">Serv. ayer</th>
              <th className="px-3 py-2 text-right font-medium">Venta ayer</th>
              <th className="px-3 py-2 text-right font-medium">Prom/día mes actual</th>
              <th className="px-3 py-2 text-center font-medium">vs actual</th>
              <th className="px-3 py-2 text-right font-medium">Prom/día mes pasado</th>
              <th className="px-3 py-2 text-center font-medium">vs pasado</th>
              <th className="px-3 py-2 text-right font-medium">Última venta</th>
              <th className="px-3 py-2 text-right font-medium">Sin venta (oper.)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filas.map((f) => {
              const promAct = Number(f.prom_dia_actual);
              const promPas = Number(f.prom_dia_pasado);
              const hrs = horasDesde(f.ultima_venta);
              const muerta = f.servicios_ayer === 0;
              const horasOp = Number(f.horas_op_sin_venta);
              const revisarEsta = f.abierta_ahora && horasOp >= UMBRAL_HORAS;
              return (
                <tr
                  key={f.maquina_id}
                  className={revisarEsta ? "bg-red-50" : "hover:bg-zinc-50"}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {f.alias ?? `Serie ${f.serie}`}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      #{f.serie}
                      {f.ubicacion ? ` · ${f.ubicacion}` : ""}
                      {f.cliente ? ` · ${f.cliente}` : ""}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {f.ruta_nombre ? `🛣 ${f.ruta_nombre}` : "sin ruta"}
                      {f.operador_nombre ? ` · 👤 ${f.operador_nombre}` : ""}
                    </div>
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${muerta ? "font-semibold text-red-700" : ""}`}
                  >
                    {f.servicios_ayer}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMxn(Number(f.monto_ayer))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {promAct.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Semaforo bajo={f.servicios_ayer < promAct} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {promPas.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Semaforo bajo={f.servicios_ayer < promPas} />
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {f.ultima_venta ? (
                      <span
                        className={
                          hrs != null && hrs >= 12
                            ? "font-medium text-red-700"
                            : "text-zinc-500"
                        }
                      >
                        {fmtCDMXFechaHora(f.ultima_venta)}
                        {hrs != null && (
                          <span className="ml-1 text-[10px]">
                            ({Math.floor(hrs)}h)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-400">sin ventas</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {revisarEsta ? (
                      <span className="font-semibold text-red-700">
                        {Math.round(horasOp)} h 🚨
                      </span>
                    ) : (
                      <span className="text-zinc-500">
                        {Math.round(horasOp)} h
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filas.length === 0 && !error && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-zinc-500">
                  Sin datos.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-zinc-200 bg-zinc-50 text-sm font-medium">
            <tr>
              <td className="px-3 py-2">Total ({filas.length} máquinas)</td>
              <td className="px-3 py-2 text-right tabular-nums">{totServ}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMxn(totMonto)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-500" colSpan={6}>
                Prom. servicios/máquina/día: {proDia.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] text-zinc-500">
        Ayer = día natural anterior completo (CDMX). Venta = precio con IVA
        cobrado por la máquina (todo Nayax/tarjeta). Promedio/día = servicios del
        mes ÷ días transcurridos (mes actual hasta ayer; mes pasado completo).
        Semáforo: <span className="text-red-700">BAJO</span> si ayer &lt;
        promedio, <span className="text-green-700">ARRIBA</span> si ayer ≥
        promedio. <strong>Sin venta (oper.)</strong> = horas sin vender contando
        solo el horario de operación del gym (default 06:00–23:00); a partir de{" "}
        {UMBRAL_HORAS} h se marca para revisión y se genera alerta automática
        cada hora.
      </p>
    </div>
  );
}

function Semaforo({ bajo }: { bajo: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        bajo ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
      }`}
    >
      {bajo ? "BAJO" : "ARRIBA"}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "zinc" | "red";
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
        ? "text-red-700"
        : "text-zinc-900";
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
