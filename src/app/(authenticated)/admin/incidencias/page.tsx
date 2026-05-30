import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Incidencias · MuscleUp" };

const ESTADO_BADGE: Record<string, string> = {
  abierta: "bg-red-100 text-red-700",
  en_revision: "bg-amber-100 text-amber-700",
  resuelta: "bg-green-100 text-green-700",
  descartada: "bg-zinc-200 text-zinc-600",
};

const SEVERIDAD_BADGE: Record<string, string> = {
  baja: "bg-zinc-100 text-zinc-600",
  media: "bg-amber-100 text-amber-700",
  alta: "bg-red-100 text-red-700",
};

type SearchParams = {
  estado?: string;
  severidad?: string;
  tipo?: string;
};

export default async function IncidenciasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  let query = supabase
    .from("incidencias")
    .select(
      `id, folio, tipo, severidad, estado, descripcion,
       fecha_apertura, requiere_autorizacion_merma, autorizada_por,
       cartuchos_afectados,
       maquina:maquinas(serie, alias),
       operador:profiles!incidencias_operador_id_fkey(full_name)`,
    )
    .order("fecha_apertura", { ascending: false })
    .limit(100);

  const estadoFiltro = searchParams.estado ?? "abierta_revision";
  if (estadoFiltro === "abierta_revision") {
    query = query.in("estado", ["abierta", "en_revision"]);
  } else if (estadoFiltro !== "todas") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = query.eq("estado", estadoFiltro as any);
  }

  if (
    searchParams.severidad &&
    ["baja", "media", "alta"].includes(searchParams.severidad)
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = query.eq("severidad", searchParams.severidad as any);
  }

  if (searchParams.tipo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = query.eq("tipo", searchParams.tipo as any);
  }

  const { data: incidencias, error } = await query;

  const { data: stats } = await supabase
    .from("incidencias")
    .select("estado, severidad");
  const abiertas =
    (stats ?? []).filter((i) => i.estado === "abierta").length || 0;
  const enRevision =
    (stats ?? []).filter((i) => i.estado === "en_revision").length || 0;
  const requierenMerma =
    (stats ?? []).filter(
      (i) => i.estado === "abierta" || i.estado === "en_revision",
    ).length || 0;
  // Conteo de las que estrictamente requieren autorización pero no la tienen
  const { data: pendientesMerma } = await supabase
    .from("incidencias")
    .select("id")
    .eq("requiere_autorizacion_merma", true)
    .is("autorizada_por", null)
    .in("estado", ["abierta", "en_revision"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incidencias</h1>
        <p className="text-sm text-zinc-600">
          Reportes de operadores en campo, discrepancias de devolución y
          eventos generados por el sistema.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Abiertas" value={String(abiertas)} tone="red" />
        <Stat label="En revisión" value={String(enRevision)} tone="amber" />
        <Stat
          label="Activas"
          value={String(requierenMerma)}
          tone="zinc"
        />
        <Stat
          label="Pend. autorizar merma"
          value={String((pendientesMerma ?? []).length)}
          tone="amber"
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
            <option value="abierta_revision">Abierta o en revisión</option>
            <option value="abierta">Solo abierta</option>
            <option value="en_revision">Solo en revisión</option>
            <option value="resuelta">Resueltas</option>
            <option value="descartada">Descartadas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Severidad
          </label>
          <select
            name="severidad"
            defaultValue={searchParams.severidad ?? ""}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="">Todas</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
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
              <th className="px-3 py-2 font-medium">Folio</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Sev.</th>
              <th className="px-3 py-2 font-medium">Máquina</th>
              <th className="px-3 py-2 font-medium">Operador</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Merma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(incidencias ?? []).map((i) => {
              const maq = Array.isArray(i.maquina) ? i.maquina[0] : i.maquina;
              const op = Array.isArray(i.operador) ? i.operador[0] : i.operador;
              return (
                <tr key={i.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={`/admin/incidencias/${i.id}`}
                      className="hover:underline"
                    >
                      {i.folio}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {new Date(i.fecha_apertura).toLocaleString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {i.tipo.replace(/_/g, " ")}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        SEVERIDAD_BADGE[i.severidad] ?? "bg-zinc-100"
                      }`}
                    >
                      {i.severidad}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {maq?.serie ?? "—"}
                    {maq?.alias && (
                      <div className="font-sans text-xs text-zinc-500">
                        {maq.alias}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-700">
                    {op?.full_name ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        ESTADO_BADGE[i.estado] ?? "bg-zinc-100"
                      }`}
                    >
                      {i.estado.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {i.requiere_autorizacion_merma ? (
                      i.autorizada_por ? (
                        <span className="text-green-700">✓ autorizada</span>
                      ) : (
                        <span className="text-red-700">pend.</span>
                      )
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(incidencias ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-zinc-500"
                >
                  Sin incidencias para los filtros aplicados.
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
  tone: "red" | "amber" | "zinc";
}) {
  const valueColor =
    tone === "red"
      ? "text-red-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}
