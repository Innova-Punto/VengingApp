import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Servicios · Innovaypunto" };

type SearchParams = {
  maquina?: string;
  operador?: string;
};

export default async function ServiciosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "planeador");
  const supabase = createClient();

  let query = supabase
    .from("servicio_visitas")
    .select(
      `id, folio, fecha, producto_repuesto, cantidad_repuesta,
       lider_nombre, firma_no_disponible,
       maquina:maquinas(id, serie, alias, ubicacion:ubicaciones(nombre, cliente:clientes(nombre))),
       operador:profiles!servicio_visitas_operador_id_fkey(id, full_name),
       respuestas:servicio_respuestas(estado)`,
    )
    .order("fecha", { ascending: false })
    .limit(100);

  if (searchParams.maquina) {
    query = query.eq("maquina_id", searchParams.maquina);
  }
  if (searchParams.operador) {
    query = query.eq("operador_id", searchParams.operador);
  }

  const [{ data: visitas, error }, { data: maquinasServicio }] =
    await Promise.all([
      query,
      supabase
        .from("maquinas")
        .select("id, serie, alias")
        .eq("tipo", "servicio")
        .eq("activo", true)
        .order("alias"),
    ]);

  // Stats del mes en curso (CDMX)
  const hoyCdmx = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }),
  );
  const inicioMes = new Date(hoyCdmx.getFullYear(), hoyCdmx.getMonth(), 1);
  const { data: mesActual } = await supabase
    .from("servicio_visitas")
    .select("id, firma_no_disponible, respuestas:servicio_respuestas(estado)")
    .gte("fecha", inicioMes.toISOString());

  const totalMes = (mesActual ?? []).length;
  const conFallasMes = (mesActual ?? []).filter((v) =>
    (v.respuestas ?? []).some((r) => r.estado === "mal"),
  ).length;
  const sinFirmaMes = (mesActual ?? []).filter(
    (v) => v.firma_no_disponible,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Servicios</h1>
        <p className="text-sm text-zinc-600">
          Visitas de servicio a máquinas tipo servicio (Smart Energy):
          checklist, fallas detectadas y firma del líder del sitio.
        </p>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Servicios este mes" value={String(totalMes)} tone="zinc" />
        <Stat label="Con fallas" value={String(conFallasMes)} tone="red" />
        <Stat label="Sin firma" value={String(sinFirmaMes)} tone="amber" />
      </section>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Máquina
          </label>
          <select
            name="maquina"
            defaultValue={searchParams.maquina ?? ""}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="">Todas</option>
            {(maquinasServicio ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.alias ?? m.serie}
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
              <th className="px-3 py-2 font-medium">Folio</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Máquina</th>
              <th className="px-3 py-2 font-medium">Operador</th>
              <th className="px-3 py-2 font-medium">Checklist</th>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium">Firma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(visitas ?? []).map((v) => {
              const maq = Array.isArray(v.maquina) ? v.maquina[0] : v.maquina;
              const ubic = maq
                ? Array.isArray(maq.ubicacion)
                  ? maq.ubicacion[0]
                  : maq.ubicacion
                : null;
              const cliente = ubic
                ? Array.isArray(ubic.cliente)
                  ? ubic.cliente[0]
                  : ubic.cliente
                : null;
              const op = Array.isArray(v.operador)
                ? v.operador[0]
                : v.operador;
              const resp = v.respuestas ?? [];
              const fallas = resp.filter((r) => r.estado === "mal").length;
              return (
                <tr key={v.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={`/admin/servicios/${v.id}`}
                      className="hover:underline"
                    >
                      {v.folio}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {fmtCDMX(v.fecha, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-mono">{maq?.serie ?? "—"}</span>
                    <div className="text-zinc-500">
                      {maq?.alias ?? ""}
                      {cliente ? ` · ${cliente.nombre}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-700">
                    {op?.full_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {fallas === 0 ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
                        ✓ {resp.length} bien
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                        {fallas} falla{fallas === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-700">
                    {v.producto_repuesto
                      ? `Repuso ${v.cantidad_repuesta ?? "—"}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {v.firma_no_disponible ? (
                      <span className="text-amber-700">sin firma</span>
                    ) : (
                      <span className="text-green-700">
                        ✓ {v.lider_nombre}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(visitas ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-zinc-500"
                >
                  Sin servicios registrados para los filtros aplicados.
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
