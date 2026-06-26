import Link from "next/link";

import { requireRole } from "@/lib/auth";
import {
  CATEGORIA_COLOR,
  CATEGORIA_LABEL,
  INCIDENCIAS_CATALOGO,
  getIncidenciaTipoInfo,
} from "@/lib/incidencias-catalogo";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Incidencias por máquina · Innovaypunto" };

const SEVERIDAD_PESO: Record<string, number> = { baja: 1, media: 2, alta: 3 };

type SearchParams = { dias?: string; tipo?: string };

export default async function IncidenciasPorMaquinaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "planeador");
  const supabase = createClient();

  const dias = Number(searchParams.dias) > 0 ? Number(searchParams.dias) : 90;
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const tipoFiltro = searchParams.tipo ?? "";

  let query = supabase
    .from("incidencias")
    .select(
      `id, folio, tipo, severidad, estado, fecha_apertura, maquina_id,
       maquina:maquinas(serie, alias, ubicacion:ubicaciones(nombre, cliente:clientes(nombre)))`,
    )
    .gte("fecha_apertura", desde)
    .not("maquina_id", "is", null)
    .order("fecha_apertura", { ascending: false });

  if (tipoFiltro) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = query.eq("tipo", tipoFiltro as any);
  }

  const { data: incidencias } = await query;

  // Agrupar por máquina
  type MaquinaStats = {
    maquina_id: string;
    serie: string;
    alias: string | null;
    cliente: string | null;
    ubicacion: string | null;
    total: number;
    abiertas: number;
    altas: number;
    severidad_avg: number;
    tipos: Map<string, number>;
    masVieja: { folio: string; fecha: string; id: string } | null;
    incidencias: {
      id: string;
      folio: string;
      tipo: string;
      severidad: string;
      estado: string;
      fecha: string;
    }[];
  };

  const porMaquina = new Map<string, MaquinaStats>();
  for (const inc of incidencias ?? []) {
    if (!inc.maquina_id) continue;
    const maq = Array.isArray(inc.maquina) ? inc.maquina[0] : inc.maquina;
    if (!maq) continue;
    const ubic = Array.isArray(maq.ubicacion) ? maq.ubicacion[0] : maq.ubicacion;
    const cli = ubic
      ? Array.isArray(ubic.cliente)
        ? ubic.cliente[0]
        : ubic.cliente
      : null;

    const acc: MaquinaStats = porMaquina.get(inc.maquina_id) ?? {
      maquina_id: inc.maquina_id,
      serie: maq.serie,
      alias: maq.alias ?? null,
      cliente: cli?.nombre ?? null,
      ubicacion: ubic?.nombre ?? null,
      total: 0,
      abiertas: 0,
      altas: 0,
      severidad_avg: 0,
      tipos: new Map<string, number>(),
      masVieja: null,
      incidencias: [],
    };
    acc.total += 1;
    if (inc.estado === "abierta" || inc.estado === "en_revision") acc.abiertas += 1;
    if (inc.severidad === "alta") acc.altas += 1;
    acc.severidad_avg += SEVERIDAD_PESO[inc.severidad] ?? 0;
    acc.tipos.set(inc.tipo, (acc.tipos.get(inc.tipo) ?? 0) + 1);
    if (
      (inc.estado === "abierta" || inc.estado === "en_revision") &&
      (!acc.masVieja || inc.fecha_apertura < acc.masVieja.fecha)
    ) {
      acc.masVieja = {
        folio: inc.folio,
        fecha: inc.fecha_apertura,
        id: inc.id,
      };
    }
    acc.incidencias.push({
      id: inc.id,
      folio: inc.folio,
      tipo: inc.tipo,
      severidad: inc.severidad,
      estado: inc.estado,
      fecha: inc.fecha_apertura,
    });
    porMaquina.set(inc.maquina_id, acc);
  }

  const filas = Array.from(porMaquina.values())
    .map((m) => ({
      ...m,
      severidad_avg: m.total > 0 ? m.severidad_avg / m.total : 0,
      tipo_top: getTopTipo(m.tipos),
      tipo_top_count: getTopTipoCount(m.tipos),
      recurrente_alerta: isRecurrente(m.tipos),
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/incidencias"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Incidencias
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Análisis por máquina
        </h1>
        <p className="text-sm text-zinc-600">
          Recurrencia de incidencias para detectar máquinas problemáticas.
          Una máquina con ≥3 incidencias del mismo tipo en el período se
          marca como recurrente.
        </p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Período
          </label>
          <select
            name="dias"
            defaultValue={String(dias)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="30">30 días</option>
            <option value="60">60 días</option>
            <option value="90">90 días</option>
            <option value="180">180 días</option>
            <option value="365">1 año</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Tipo
          </label>
          <select
            name="tipo"
            defaultValue={tipoFiltro}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="">Todos</option>
            {INCIDENCIAS_CATALOGO.map((c) => (
              <option key={c.tipo} value={c.tipo}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Filtrar
        </button>
      </form>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Máquinas con incidencias" value={String(filas.length)} />
        <Stat
          label="Total incidencias"
          value={String((incidencias ?? []).length)}
        />
        <Stat
          label="Recurrentes (≥3 mismo tipo)"
          value={String(filas.filter((f) => f.recurrente_alerta).length)}
          tone={filas.some((f) => f.recurrente_alerta) ? "red" : "zinc"}
        />
        <Stat
          label="Severidad alta"
          value={String(filas.reduce((s, f) => s + f.altas, 0))}
          tone="red"
        />
      </section>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Máquina</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Abiertas</th>
              <th className="px-3 py-2 text-right font-medium">Altas</th>
              <th className="px-3 py-2 text-right font-medium">Sev. avg</th>
              <th className="px-3 py-2 font-medium">Tipo más frecuente</th>
              <th className="px-3 py-2 font-medium">Más vieja sin cerrar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filas.map((m) => {
              const tipoInfo = m.tipo_top
                ? getIncidenciaTipoInfo(m.tipo_top)
                : null;
              return (
                <tr
                  key={m.maquina_id}
                  className={m.recurrente_alerta ? "bg-red-50" : undefined}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/maquinas/${m.maquina_id}`}
                      className="font-mono text-xs font-medium hover:underline"
                    >
                      {m.serie}
                    </Link>
                    {m.alias && (
                      <div className="text-xs text-zinc-600">{m.alias}</div>
                    )}
                    {(m.cliente || m.ubicacion) && (
                      <div className="text-[10px] text-zinc-500">
                        {m.cliente ?? ""}
                        {m.cliente && m.ubicacion ? " · " : ""}
                        {m.ubicacion ?? ""}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {m.total}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      m.abiertas > 0 ? "text-amber-700" : "text-zinc-500"
                    }`}
                  >
                    {m.abiertas}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      m.altas > 0 ? "text-red-700" : "text-zinc-500"
                    }`}
                  >
                    {m.altas}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {m.severidad_avg.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {tipoInfo ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                          CATEGORIA_COLOR[tipoInfo.categoria]
                        }`}
                      >
                        {tipoInfo.label}
                      </span>
                    ) : (
                      "—"
                    )}
                    {m.tipo_top && (
                      <span className="ml-1 text-zinc-500">
                        ({m.tipo_top_count})
                      </span>
                    )}
                    {m.recurrente_alerta && (
                      <div className="mt-0.5 text-[10px] font-medium text-red-700">
                        ⚠ Recurrente
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {m.masVieja ? (
                      <Link
                        href={`/admin/incidencias/${m.masVieja.id}`}
                        className="hover:underline"
                      >
                        <span className="font-mono">{m.masVieja.folio}</span>
                        <div className="text-[10px] text-zinc-500">
                          {Math.floor(
                            (Date.now() -
                              new Date(m.masVieja.fecha).getTime()) /
                              86400000,
                          )}{" "}
                          días
                        </div>
                      </Link>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filas.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-zinc-500"
                >
                  Sin incidencias en el período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-zinc-700">
          Catálogo de tipos
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {INCIDENCIAS_CATALOGO.map((c) => (
            <div
              key={c.tipo}
              className="rounded-md border border-zinc-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-zinc-900">{c.label}</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${
                    CATEGORIA_COLOR[c.categoria]
                  }`}
                >
                  {CATEGORIA_LABEL[c.categoria]}
                </span>
                {c.impactaInventario && (
                  <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">
                    Impacta inventario
                  </span>
                )}
                <span className="ml-auto text-[10px] text-zinc-500">
                  default: {c.severidadDefault}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-600">{c.descripcion}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function getTopTipo(tipos: Map<string, number>): string | null {
  let top: string | null = null;
  let max = 0;
  tipos.forEach((count, tipo) => {
    if (count > max) {
      max = count;
      top = tipo;
    }
  });
  return top;
}

function getTopTipoCount(tipos: Map<string, number>): number {
  let max = 0;
  tipos.forEach((count) => {
    if (count > max) max = count;
  });
  return max;
}

function isRecurrente(tipos: Map<string, number>): boolean {
  let max = 0;
  tipos.forEach((count) => {
    if (count > max) max = count;
  });
  return max >= 3;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "zinc";
}) {
  const color = tone === "red" ? "text-red-700" : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
