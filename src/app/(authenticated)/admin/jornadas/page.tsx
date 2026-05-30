import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Jornadas · MuscleUp" };

const ESTADO_BADGE: Record<string, string> = {
  planeada: "bg-zinc-100 text-zinc-600",
  surtida: "bg-blue-100 text-blue-700",
  en_jornada: "bg-amber-100 text-amber-700",
  completada: "bg-green-100 text-green-700",
  cancelada: "bg-red-100 text-red-700",
};

type SearchParams = {
  desde?: string;
  hasta?: string;
  operador?: string;
};

export default async function JornadasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const hoy = new Date().toISOString().slice(0, 10);
  const hace7 = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  const desde = searchParams.desde ?? hace7;
  const hasta = searchParams.hasta ?? hoy;

  let query = supabase
    .from("jornadas")
    .select(
      `id, hora_inicio, hora_ultima_actividad,
       asignacion:asignaciones_diarias!jornadas_asignacion_id_fkey(
         id, fecha, estado,
         ruta:rutas(nombre, color_hex)
       ),
       operador:profiles!jornadas_operador_id_fkey(full_name)`,
    )
    .order("hora_inicio", { ascending: false })
    .limit(100);

  if (searchParams.operador) {
    query = query.eq("operador_id", searchParams.operador);
  }

  const { data: jornadas, error } = await query;

  // Filtrar por rango de fecha de la asignación (en cliente porque está en una relación)
  const filtradas = (jornadas ?? []).filter((j) => {
    const asig = Array.isArray(j.asignacion) ? j.asignacion[0] : j.asignacion;
    if (!asig?.fecha) return false;
    return asig.fecha >= desde && asig.fecha <= hasta;
  });

  // Operadores para el filtro
  const { data: operadoresRaw } = await supabase
    .from("profiles")
    .select(
      `id, full_name,
       user_roles!user_roles_user_id_fkey(role)`,
    )
    .eq("activo", true)
    .order("full_name");

  const operadores = (operadoresRaw ?? []).filter((p) => {
    const roles = Array.isArray(p.user_roles)
      ? p.user_roles.map((r) => r.role)
      : [];
    return roles.includes("operador");
  });

  // Stats agregados de las jornadas mostradas
  const ids = filtradas.map((j) => j.id);
  const asigIds = filtradas
    .map((j) => {
      const a = Array.isArray(j.asignacion) ? j.asignacion[0] : j.asignacion;
      return a?.id;
    })
    .filter((x): x is string => Boolean(x));

  let totalCheckIns = 0;
  let totalIncidencias = 0;
  if (asigIds.length > 0) {
    const { count: c1 } = await supabase
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .in("asignacion_id", asigIds);
    totalCheckIns = c1 ?? 0;
  }
  if (ids.length > 0) {
    // Incidencias por operador en estas fechas (aproximación: por check_in.asignacion_id)
    const { count: c2 } = await supabase
      .from("incidencias")
      .select("id, check_in:check_ins!incidencias_check_in_id_fkey(asignacion_id)", {
        count: "exact",
        head: true,
      });
    totalIncidencias = c2 ?? 0;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Jornadas</h1>
        <p className="text-sm text-zinc-600">
          Auditoría del trabajo en campo de los operadores: tiempos, GPS,
          fotos, llenados, devoluciones e incidencias.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Jornadas en rango" value={String(filtradas.length)} />
        <Stat label="Check-ins" value={String(totalCheckIns)} />
        <Stat label="Incidencias (total)" value={String(totalIncidencias)} />
      </section>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Desde
          </label>
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Hasta
          </label>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          />
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
            {operadores.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
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
              <th className="px-3 py-2 font-medium">Ruta</th>
              <th className="px-3 py-2 font-medium">Operador</th>
              <th className="px-3 py-2 font-medium">Inicio</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtradas.map((j) => {
              const asig = Array.isArray(j.asignacion)
                ? j.asignacion[0]
                : j.asignacion;
              const ruta = asig
                ? Array.isArray(asig.ruta)
                  ? asig.ruta[0]
                  : asig.ruta
                : null;
              const op = Array.isArray(j.operador) ? j.operador[0] : j.operador;
              return (
                <tr key={j.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-2 text-zinc-700">
                    <Link
                      href={`/admin/jornadas/${j.id}`}
                      className="hover:underline"
                    >
                      {asig?.fecha ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-1 rounded-sm"
                        style={{
                          backgroundColor: ruta?.color_hex ?? "#a1a1aa",
                        }}
                      />
                      <span className="text-zinc-700">
                        {ruta?.nombre ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {op?.full_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {new Date(j.hora_inicio).toLocaleTimeString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        ESTADO_BADGE[asig?.estado ?? ""] ?? "bg-zinc-100"
                      }`}
                    >
                      {asig?.estado ?? "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-zinc-500">
                  Sin jornadas en el rango seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
