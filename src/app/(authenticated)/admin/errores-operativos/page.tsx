import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import {
  ESTADO_BADGE,
  ESTADO_LABEL,
  ESTADOS,
  MOTIVO_LABEL,
  MOTIVOS,
} from "@/lib/errores-operativos";
import { createClient } from "@/lib/supabase/server";

import { NuevoErrorButton } from "./NuevoErrorButton";

export const metadata = { title: "Errores operativos · MuscleUp" };

type SearchParams = {
  estado?: string;
  motivo?: string;
  operador?: string;
  ruta?: string;
};

export default async function ErroresOperativosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  let query = supabase
    .from("errores_operativos")
    .select(
      `id, motivo, estado, descripcion, fecha,
       ruta:rutas(id, nombre, color_hex),
       operador:profiles!errores_operativos_operador_id_fkey(id, full_name),
       maquina:maquinas(serie, alias),
       asignacion:asignaciones_diarias(fecha),
       levantado_por_profile:profiles!errores_operativos_levantado_por_fkey(full_name)`,
    )
    .order("fecha", { ascending: false })
    .limit(200);

  const estadoFiltro = searchParams.estado ?? "abierto";
  if (estadoFiltro !== "todos") {
    query = query.eq(
      "estado",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estadoFiltro as any,
    );
  }
  if (searchParams.motivo) {
    query = query.eq(
      "motivo",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      searchParams.motivo as any,
    );
  }
  if (searchParams.operador) query = query.eq("operador_id", searchParams.operador);
  if (searchParams.ruta) query = query.eq("ruta_id", searchParams.ruta);

  const { data: errores, error } = await query;

  const { data: stats } = await supabase
    .from("errores_operativos")
    .select("estado, motivo");
  const abiertos = (stats ?? []).filter((e) => e.estado === "abierto").length;
  const resueltos = (stats ?? []).filter((e) => e.estado === "resuelto").length;
  const descartados = (stats ?? []).filter((e) => e.estado === "descartado")
    .length;

  // Para los selects
  const [{ data: operadores }, { data: rutas }, { data: maquinas }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("rutas").select("id, nombre").order("nombre"),
      supabase
        .from("maquinas")
        .select("id, serie, alias")
        .eq("activo", true)
        .order("serie"),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Errores operativos
          </h1>
          <p className="text-sm text-zinc-600">
            Errores observados por supervisión durante las jornadas. A
            diferencia de las incidencias, estos los levanta el supervisor
            desde la auditoría.
          </p>
        </div>
        <NuevoErrorButton
          operadores={(operadores ?? []).map((o) => ({
            id: o.id,
            full_name: o.full_name ?? "",
          }))}
          rutas={(rutas ?? []).map((r) => ({ id: r.id, nombre: r.nombre }))}
          maquinas={(maquinas ?? []).map((m) => ({
            id: m.id,
            serie: m.serie,
            alias: m.alias,
          }))}
        />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Abiertos" value={String(abiertos)} tone="amber" />
        <Stat label="Resueltos" value={String(resueltos)} tone="green" />
        <Stat label="Descartados" value={String(descartados)} tone="zinc" />
        <Stat
          label="Total"
          value={String((stats ?? []).length)}
          tone="zinc"
        />
      </section>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Estado
          </label>
          <select
            name="estado"
            defaultValue={estadoFiltro}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="todos">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Motivo
          </label>
          <select
            name="motivo"
            defaultValue={searchParams.motivo ?? ""}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="">Todos</option>
            {MOTIVOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Operador
          </label>
          <select
            name="operador"
            defaultValue={searchParams.operador ?? ""}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="">Todos</option>
            {(operadores ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Ruta
          </label>
          <select
            name="ruta"
            defaultValue={searchParams.ruta ?? ""}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="">Todas</option>
            {(rutas ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
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

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Error: {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Motivo</th>
              <th className="px-3 py-2 font-medium">Operador</th>
              <th className="px-3 py-2 font-medium">Ruta</th>
              <th className="px-3 py-2 font-medium">Máquina</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Descripción</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(errores ?? []).map((e) => {
              const ruta = Array.isArray(e.ruta) ? e.ruta[0] : e.ruta;
              const op = Array.isArray(e.operador) ? e.operador[0] : e.operador;
              const maq = Array.isArray(e.maquina) ? e.maquina[0] : e.maquina;
              return (
                <tr key={e.id} className="hover:bg-zinc-50 align-top">
                  <td className="px-3 py-2 text-xs text-zinc-700">
                    {fmtCDMX(e.fecha, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {MOTIVO_LABEL[e.motivo]}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {op?.full_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {ruta ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: ruta.color_hex ?? "#a1a1aa",
                          }}
                        />
                        {ruta.nombre}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {maq?.serie ?? <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        ESTADO_BADGE[e.estado]
                      }`}
                    >
                      {ESTADO_LABEL[e.estado]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {e.descripcion ?? (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <Link
                      href={`/admin/errores-operativos/${e.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      Abrir →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(errores ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-zinc-500"
                >
                  Sin errores operativos para los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
  tone: "amber" | "green" | "zinc";
}) {
  const color =
    tone === "amber"
      ? "text-amber-700"
      : tone === "green"
        ? "text-green-700"
        : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
