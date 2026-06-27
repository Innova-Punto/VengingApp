import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import AgregarMaquinaForm from "./AgregarMaquinaForm";
import CrearEmergenciaForm from "./CrearEmergenciaForm";

export const metadata = { title: "Emergencias · Innovaypunto" };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const ESTADOS_ACTIVOS = ["planeada", "surtida", "en_jornada"] as const;

const ESTADO_BADGE: Record<string, string> = {
  planeada: "bg-zinc-100 text-zinc-600",
  surtida: "bg-blue-100 text-blue-700",
  en_jornada: "bg-amber-100 text-amber-700",
};

export default async function EmergenciasPage({
  searchParams,
}: {
  searchParams: { fecha?: string };
}) {
  await requireRole("admin", "direccion", "almacen");

  const fecha = (searchParams.fecha ?? todayISO()).slice(0, 10);
  const supabase = createClient();

  // Operadores activos (dos queries: el embed no siempre resuelve)
  const { data: rolesRows } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "operador");
  const operadorIds = (rolesRows ?? []).map((r) => r.user_id);
  const { data: operadoresRaw } =
    operadorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", operadorIds)
          .eq("activo", true)
          .order("full_name")
      : { data: [] };
  const operadores = (operadoresRaw ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
  }));

  // Máquinas activas para los selects
  const { data: maquinasRaw } = await supabase
    .from("maquinas")
    .select("id, serie, alias")
    .eq("activo", true)
    .neq("estado", "baja")
    .order("serie");
  const maquinas = (maquinasRaw ?? []).map((m) => ({
    id: m.id,
    serie: m.serie,
    alias: m.alias,
  }));

  // Asignaciones activas de la fecha
  const { data: asigRaw } = await supabase
    .from("asignaciones_diarias")
    .select(
      `id, estado, es_emergencia, operador_id,
       ruta:rutas(nombre),
       maquinas:asignacion_maquinas(id, maquina_id, origen)`,
    )
    .eq("fecha", fecha)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .in("estado", ESTADOS_ACTIVOS as unknown as any)
    .order("created_at");
  const asignaciones = asigRaw ?? [];

  // Mapas de nombres
  const opName = new Map(operadores.map((o) => [o.id, o.full_name]));
  const maqName = new Map(maquinas.map((m) => [m.id, m]));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/planeacion/asignaciones"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Asignaciones
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          🚨 Emergencias y máquinas fuera de ruta
        </h1>
        <p className="text-sm text-zinc-500">
          Crea una ruta de emergencia (vacía, para cualquier operador, varias
          por día) o agrega una máquina con falla a una asignación activa. El
          operador siempre tendrá que hacer check-in en la máquina.
        </p>
      </div>

      {/* Crear emergencia */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Nueva ruta de emergencia
        </h2>
        <CrearEmergenciaForm operadores={operadores} fecha={fecha} />
      </section>

      {/* Selector de fecha */}
      <form method="get" className="flex items-end gap-2">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Ver asignaciones del día
          </label>
          <input
            type="date"
            name="fecha"
            defaultValue={fecha}
            className="mt-1 block rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Ver
        </button>
      </form>

      {/* Asignaciones activas */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Asignaciones activas — agregar máquina
        </h2>
        {asignaciones.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            No hay asignaciones activas para esta fecha. Crea una emergencia
            arriba.
          </div>
        ) : (
          <div className="space-y-3">
            {asignaciones.map((a) => {
              const ruta = Array.isArray(a.ruta) ? a.ruta[0] : a.ruta;
              const maqs = Array.isArray(a.maquinas) ? a.maquinas : [];
              return (
                <div
                  key={a.id}
                  className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                    <div className="flex items-center gap-2">
                      {a.es_emergencia ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          🚨 Emergencia
                        </span>
                      ) : (
                        <span className="font-medium text-zinc-900">
                          {ruta?.nombre ?? "Ruta"}
                        </span>
                      )}
                      <span className="text-sm text-zinc-600">
                        {opName.get(a.operador_id) ?? "—"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          ESTADO_BADGE[a.estado] ?? "bg-zinc-100"
                        }`}
                      >
                        {a.estado.replace(/_/g, " ")}
                      </span>
                    </div>
                    <Link
                      href={`/planeacion/asignaciones/${a.id}`}
                      className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline"
                    >
                      ver detalle →
                    </Link>
                  </header>

                  <div className="px-4 py-3">
                    {maqs.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {maqs.map((am) => {
                          const m = maqName.get(am.maquina_id);
                          return (
                            <span
                              key={am.id}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                                am.origen === "agregada_excepcion"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-zinc-100 text-zinc-600"
                              }`}
                            >
                              {m?.serie ?? am.maquina_id.slice(0, 8)}
                              {am.origen === "agregada_excepcion" && " ·exc"}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <AgregarMaquinaForm asignacionId={a.id} maquinas={maquinas} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
