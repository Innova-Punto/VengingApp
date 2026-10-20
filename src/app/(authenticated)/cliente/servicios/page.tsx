import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Servicios · Innovaypunto" };
export const dynamic = "force-dynamic";

type SearchParams = { maquina?: string };

type Servicio = {
  id: string;
  folio: string | null;
  fecha: string;
  maquina_id: string;
  serie: string;
  maquina: string | null;
  ubicacion: string;
  operador: string | null;
  producto_repuesto: boolean | null;
  cantidad_repuesta: number | null;
  observaciones: string | null;
  firmada: boolean;
  firma_no_disponible: boolean | null;
  checklist_total: number;
  checklist_bien: number;
  checklist_mal: number;
};

export default async function ClienteServiciosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("cliente", "admin", "direccion");
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  let query = sb
    .from("v_cliente_servicios")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(200);
  if (searchParams.maquina) query = query.eq("maquina_id", searchParams.maquina);

  const { data, error } = await query;
  const servicios = (data ?? []) as Servicio[];

  // El selector sale de los propios servicios: así solo ofrece máquinas que de
  // verdad tienen visitas, y no hace falta una segunda consulta.
  const maquinas = Array.from(
    new Map(
      servicios.map((s) => [s.maquina_id, s.maquina ?? s.serie]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const delMes = servicios.filter((s) => new Date(s.fecha) >= inicioMes);
  const conFallas = delMes.filter((s) => s.checklist_mal > 0).length;
  const sinFirma = delMes.filter(
    (s) => !s.firmada && !s.firma_no_disponible,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Servicios</h1>
        <p className="text-sm text-zinc-600">
          Visitas de servicio a las máquinas Smart Energy de tus sedes:
          checklist, fallas detectadas y hora de llegada.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Servicios este mes" valor={String(delMes.length)} />
        <Kpi
          label="Con fallas"
          valor={String(conFallas)}
          tono={conFallas > 0 ? "red" : undefined}
        />
        <Kpi
          label="Sin firma"
          valor={String(sinFirma)}
          tono={sinFirma > 0 ? "amber" : undefined}
        />
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
            className="mt-1 w-64 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">Todas</option>
            {maquinas.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
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

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Folio</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Máquina</th>
              <th className="px-3 py-2 font-medium">Atendió</th>
              <th className="px-3 py-2 text-center font-medium">Checklist</th>
              <th className="px-3 py-2 text-center font-medium">Producto</th>
              <th className="px-3 py-2 text-center font-medium">Firma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {servicios.map((s) => (
              <tr key={s.id} className="hover:bg-zinc-50">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500">
                  {s.folio ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                  {fmtCDMX(s.fecha, {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-zinc-900">
                    {s.maquina ?? s.serie}
                  </div>
                  <div className="text-xs text-zinc-500">{s.ubicacion}</div>
                </td>
                <td className="px-3 py-2 text-zinc-600">{s.operador ?? "—"}</td>
                <td className="px-3 py-2 text-center">
                  {s.checklist_total === 0 ? (
                    <span className="text-xs text-zinc-400">—</span>
                  ) : (
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        s.checklist_mal > 0
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {s.checklist_bien}/{s.checklist_total}
                      {s.checklist_mal > 0 && ` · ${s.checklist_mal} falla`}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-zinc-600">
                  {s.producto_repuesto ? (
                    <span className="tabular-nums">
                      {s.cantidad_repuesta ?? "sí"}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {s.firmada ? (
                    <span className="text-green-700">✓</span>
                  ) : s.firma_no_disponible ? (
                    <span
                      className="text-xs text-zinc-500"
                      title="El líder no estaba disponible al cerrar la visita"
                    >
                      no disponible
                    </span>
                  ) : (
                    <span className="text-amber-700">—</span>
                  )}
                </td>
              </tr>
            ))}
            {servicios.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
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

function Kpi({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: string;
  tono?: "red" | "amber";
}) {
  const cls =
    tono === "red"
      ? "border-red-200 bg-red-50"
      : tono === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-zinc-200 bg-white";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{valor}</div>
    </div>
  );
}
