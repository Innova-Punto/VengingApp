import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Asignaciones diarias · Innovaypunto" };

const ESTADO_BADGE: Record<string, string> = {
  planeada: "bg-blue-100 text-blue-700",
  surtida: "bg-indigo-100 text-indigo-700",
  en_jornada: "bg-amber-100 text-amber-700",
  completada: "bg-green-100 text-green-700",
  completada_parcialmente: "bg-orange-100 text-orange-700",
  cancelada: "bg-zinc-200 text-zinc-700",
};

type SearchParams = { fecha?: string; estado?: string };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AsignacionesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "planeador");

  const fecha = (searchParams.fecha ?? todayISO()).slice(0, 10);
  const estado = searchParams.estado ?? "todos";

  const supabase = createClient();
  let query = supabase
    .from("asignaciones_diarias")
    .select(
      `id, fecha, estado, notas,
       ruta:rutas(id, nombre, color_hex),
       operador:profiles!asignaciones_diarias_operador_id_fkey(id, full_name),
       maquinas:asignacion_maquinas(id)`,
    )
    .eq("fecha", fecha)
    .order("ruta(nombre)");

  if (
    estado === "planeada" ||
    estado === "surtida" ||
    estado === "en_jornada" ||
    estado === "completada" ||
    estado === "cancelada"
  ) {
    query = query.eq("estado", estado);
  }

  const { data: asigs, error } = await query;

  const counts = {
    planeada: 0,
    surtida: 0,
    en_jornada: 0,
    completada: 0,
    cancelada: 0,
  };
  for (const a of asigs ?? []) {
    if (a.estado in counts) {
      counts[a.estado as keyof typeof counts]++;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Asignaciones diarias
          </h1>
          <p className="text-sm text-zinc-600">
            Qué ruta visita cada operador, cada día.
          </p>
        </div>
        <Link
          href={`/planeacion/asignaciones/nuevo?fecha=${fecha}`}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
        >
          Nueva asignación
        </Link>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Fecha
          </label>
          <input
            type="date"
            name="fecha"
            defaultValue={fecha}
            className="mt-1 w-44 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Estado
          </label>
          <select
            name="estado"
            defaultValue={estado}
            className="mt-1 w-44 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="todos">Todos</option>
            <option value="planeada">Planeadas</option>
            <option value="surtida">Surtidas</option>
            <option value="en_jornada">En jornada</option>
            <option value="completada">Completadas</option>
            <option value="cancelada">Canceladas</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Filtrar
        </button>
      </form>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Planeadas" value={counts.planeada} color="blue" />
        <Stat label="Surtidas" value={counts.surtida} color="indigo" />
        <Stat label="En jornada" value={counts.en_jornada} color="amber" />
        <Stat label="Completadas" value={counts.completada} color="green" />
        <Stat label="Canceladas" value={counts.cancelada} />
      </section>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Error: {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium w-8"></th>
              <th className="px-4 py-2 font-medium">Ruta</th>
              <th className="px-4 py-2 font-medium">Operador</th>
              <th className="px-4 py-2 text-right font-medium">Máquinas</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(asigs ?? []).map((a) => {
              const ruta = Array.isArray(a.ruta) ? a.ruta[0] : a.ruta;
              const op = Array.isArray(a.operador)
                ? a.operador[0]
                : a.operador;
              const maquinas = Array.isArray(a.maquinas)
                ? a.maquinas.length
                : 0;
              return (
                <tr key={a.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2">
                    <div
                      className="h-6 w-2 rounded-sm"
                      style={{
                        backgroundColor: ruta?.color_hex ?? "#a1a1aa",
                      }}
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    <Link
                      href={`/planeacion/asignaciones/${a.id}`}
                      className="hover:underline"
                    >
                      {ruta?.nombre ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-700">
                    {op?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {maquinas}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        ESTADO_BADGE[a.estado] ?? "bg-zinc-100"
                      }`}
                    >
                      {a.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/planeacion/asignaciones/${a.id}`}
                      className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(asigs ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No hay asignaciones para esta fecha.
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
  color,
}: {
  label: string;
  value: number;
  color?: "blue" | "indigo" | "amber" | "green";
}) {
  const colorClass: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-green-200 bg-green-50 text-green-900",
  };
  const cls = color ? colorClass[color] : "border-zinc-200 bg-white";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-xs font-medium uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
