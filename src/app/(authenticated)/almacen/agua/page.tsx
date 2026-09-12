import { requireRole } from "@/lib/auth";
import { ML_POR_GARRAFON, mlALitros } from "@/lib/agua";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import {
  ajustarPorConteo,
  registrarEntrada,
  registrarMerma,
  registrarRetorno,
  registrarSalidaRuta,
} from "./actions";

export const metadata = { title: "Agua · Innovaypunto" };
export const dynamic = "force-dynamic";

const TIPO_LABEL: Record<string, string> = {
  entrada_compra: "Entrada por compra",
  salida_ruta: "Salida a ruta",
  retorno_ruta: "Retorno de ruta",
  ajuste_conteo: "Ajuste por conteo",
  merma: "Merma",
};

export default async function AguaAlmacenPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireRole("admin", "direccion", "almacen", "planeador");
  const supabase = createClient();

  const [{ data: saldo }, { data: origen }, { data: movimientos }, { data: maquinas }] =
    await Promise.all([
      supabase.from("v_agua_almacen").select("*").maybeSingle(),
      supabase.from("v_agua_origen_30d").select("*").maybeSingle(),
      supabase
        .from("agua_almacen_movimientos")
        .select(
          `id, fecha, tipo, garrafones, proveedor_texto, nota,
           operador:profiles!agua_almacen_movimientos_operador_id_fkey(full_name)`,
        )
        .order("fecha", { ascending: false })
        .limit(25),
      supabase.from("v_agua_maquina").select("ml_por_dia, dias_para_vaciarse, sin_medicion"),
    ]);

  const existencia = saldo?.existencia_garrafones ?? 0;

  // Consumo del parque, para traducir la existencia a días. Es el número que
  // dice si hay que comprar esta semana o la que entra.
  const mlDiaParque = (maquinas ?? []).reduce(
    (s, m) => s + (m.ml_por_dia ?? 0),
    0,
  );
  const diasDeCobertura =
    mlDiaParque > 0 ? (existencia * ML_POR_GARRAFON) / mlDiaParque : null;

  const sinMedicion = (maquinas ?? []).filter((m) => m.sin_medicion).length;
  const totalMaquinas = (maquinas ?? []).length;

  // Asignaciones de hoy, para colgar la salida a ruta de una en concreto.
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: asignacionesHoy } = await supabase
    .from("asignaciones_diarias")
    .select("id, operador_id, operador:profiles(full_name), ruta:rutas(nombre)")
    .eq("fecha", hoy)
    .neq("estado", "cancelada");

  const litrosTienda = Number(origen?.litros_compra_operador ?? 0);
  const litrosAlmacen = Number(origen?.litros_almacen ?? 0);
  const litrosTotal = litrosTienda + litrosAlmacen;
  const pctTienda = litrosTotal > 0 ? Math.round((litrosTienda / litrosTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agua · garrafones</h1>
        <p className="text-sm text-zinc-600">
          Control físico de garrafones: entradas, salidas a ruta y conteo. El
          agua <strong>no se valúa</strong> — no entra al kardex, al costo ni a
          los cierres. Aquí no se captura dinero: el gasto vive en tesorería.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(searchParams.error)}
        </p>
      )}

      {/* ── Estado ─────────────────────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            En almacén
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {existencia}
          </div>
          <div className="text-xs text-zinc-500">
            garrafones · {mlALitros(existencia * ML_POR_GARRAFON)}
          </div>
        </div>

        <div
          className={`rounded-lg border p-4 ${
            diasDeCobertura !== null && diasDeCobertura < 3
              ? "border-red-300 bg-red-50"
              : "border-zinc-200 bg-white"
          }`}
        >
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Alcanza para
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {diasDeCobertura === null ? "—" : diasDeCobertura.toFixed(1)}
          </div>
          <div className="text-xs text-zinc-500">
            días al ritmo del parque ({mlALitros(mlDiaParque)}/día)
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Comprados · 30 días
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {saldo?.comprados_30d ?? 0}
          </div>
          <div className="text-xs text-zinc-500">
            salieron a ruta {saldo?.salidos_ruta_30d ?? 0}
            {(saldo?.merma_30d ?? 0) > 0 && ` · merma ${saldo?.merma_30d}`}
          </div>
        </div>

        <div
          className={`rounded-lg border p-4 ${
            pctTienda > 20 ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-white"
          }`}
        >
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Comprado en tienda
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {pctTienda}%
          </div>
          <div className="text-xs text-zinc-500">
            {litrosTienda} L de {litrosTotal} L cargados en 30 días
          </div>
        </div>
      </section>

      {pctTienda > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Todavía entran <strong>{litrosTienda} L</strong> de agua comprada al
          menudeo por los operadores, en {origen?.maquinas_surtidas_en_tienda ?? 0}{" "}
          máquinas. Que ese número baje a cero es la señal de que la camioneta
          está cubriendo el parque.
        </p>
      )}

      {sinMedicion > 0 && (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {sinMedicion} de {totalMaquinas} máquinas todavía no tienen ninguna
          medición de agua. Hasta que un operador reporte su nivel, no se puede
          estimar cuánta agua les queda.
        </p>
      )}

      {/* ── Capturas ───────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          action={registrarEntrada}
          className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold">Entrada de garrafones</h2>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="text-xs text-zinc-500">Garrafones</label>
              <input
                name="garrafones"
                type="number"
                min={1}
                step={1}
                required
                className="mt-1 w-24 rounded-md border border-zinc-300 px-3 py-1.5 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Proveedor</label>
              <input
                name="proveedor_texto"
                placeholder="Purificadora del barrio"
                className="mt-1 w-52 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Registrar entrada
          </button>
        </form>

        <form
          action={registrarSalidaRuta}
          className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold">Salida a ruta</h2>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="text-xs text-zinc-500">Garrafones</label>
              <input
                name="garrafones"
                type="number"
                min={1}
                step={1}
                required
                className="mt-1 w-24 rounded-md border border-zinc-300 px-3 py-1.5 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Ruta de hoy</label>
              <select
                name="asignacion_id"
                className="mt-1 w-60 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
              >
                <option value="">— sin asignación —</option>
                {(asignacionesHoy ?? []).map((a) => {
                  const op = Array.isArray(a.operador) ? a.operador[0] : a.operador;
                  const ruta = Array.isArray(a.ruta) ? a.ruta[0] : a.ruta;
                  return (
                    <option key={a.id} value={a.id}>
                      {op?.full_name ?? "—"}
                      {ruta?.nombre ? ` · ${ruta.nombre}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Registrar salida
          </button>
        </form>

        <form
          action={ajustarPorConteo}
          className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold">Conteo físico</h2>
          <p className="text-xs text-zinc-600">
            Captura cuántos garrafones hay de verdad. El sistema calcula la
            diferencia contra los {existencia} registrados y la deja asentada.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-zinc-500">Garrafones contados</label>
              <input
                name="contados"
                type="number"
                min={0}
                step={1}
                required
                className="mt-1 w-28 rounded-md border border-zinc-300 px-3 py-1.5 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <input
              name="nota"
              placeholder="Nota (opcional)"
              className="mt-1 w-60 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Aplicar conteo
          </button>
        </form>

        <div className="grid gap-4 sm:grid-cols-2">
          <form
            action={registrarRetorno}
            className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4"
          >
            <h2 className="text-sm font-semibold">Retorno de ruta</h2>
            <input
              name="garrafones"
              type="number"
              min={1}
              step={1}
              required
              placeholder="Garrafones"
              className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
            />
            <button
              type="submit"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Registrar retorno
            </button>
          </form>

          <form
            action={registrarMerma}
            className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4"
          >
            <h2 className="text-sm font-semibold">Merma</h2>
            <input
              name="garrafones"
              type="number"
              min={1}
              step={1}
              required
              placeholder="Garrafones"
              className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
            />
            <input
              name="nota"
              required
              placeholder="Qué pasó"
              className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
            />
            <button
              type="submit"
              className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Registrar merma
            </button>
          </form>
        </div>
      </div>

      {/* ── Bitácora ───────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Movimiento</th>
              <th className="px-4 py-2 text-right font-medium">Garrafones</th>
              <th className="px-4 py-2 font-medium">Quién</th>
              <th className="px-4 py-2 font-medium">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(movimientos ?? []).map((m) => {
              const op = Array.isArray(m.operador) ? m.operador[0] : m.operador;
              return (
                <tr key={m.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 text-xs text-zinc-600">
                    {fmtCDMX(m.fecha, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {TIPO_LABEL[m.tipo] ?? m.tipo}
                  </td>
                  <td
                    className={`px-4 py-2 text-right text-sm font-medium tabular-nums ${
                      m.garrafones < 0 ? "text-red-700" : "text-green-700"
                    }`}
                  >
                    {m.garrafones > 0 ? `+${m.garrafones}` : m.garrafones}
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-600">
                    {op?.full_name ?? m.proveedor_texto ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-500">
                    {m.nota ?? ""}
                  </td>
                </tr>
              );
            })}
            {(movimientos ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
                  Todavía no hay movimientos de garrafones. Empieza registrando
                  la primera entrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
