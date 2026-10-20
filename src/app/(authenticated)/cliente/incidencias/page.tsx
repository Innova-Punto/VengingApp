import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Incidencias y quejas · Innovaypunto" };
export const dynamic = "force-dynamic";

type Incidencia = {
  id: string;
  folio: string | null;
  tipo: string;
  severidad: string | null;
  serie: string;
  maquina: string | null;
  ubicacion: string;
  descripcion: string | null;
  estado: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  notas_resolucion: string | null;
};

type Queja = {
  id: string;
  folio: string | null;
  fecha_reporte: string;
  maquina: string | null;
  serie: string;
  ubicacion: string;
  tipo: string;
  descripcion: string | null;
  estado: string;
  procede: boolean | null;
  fecha_cierre: string | null;
};

export default async function ClienteIncidenciasPage() {
  await requireRole("cliente", "admin", "direccion");
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const [{ data: incRaw }, { data: quejasRaw }] = await Promise.all([
    sb
      .from("v_cliente_incidencias")
      .select("*")
      .order("fecha_apertura", { ascending: false })
      .limit(200),
    sb
      .from("v_cliente_quejas")
      .select("*")
      .order("fecha_reporte", { ascending: false })
      .limit(200),
  ]);

  const incidencias = (incRaw ?? []) as Incidencia[];
  const quejas = (quejasRaw ?? []) as Queja[];
  const abiertas = incidencias.filter((i) => i.estado !== "cerrada");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Incidencias y quejas
        </h1>
        <p className="text-sm text-zinc-600">
          Lo que el operador reportó en campo y lo que reportaron tus usuarios.
          {abiertas.length > 0 && (
            <>
              {" "}
              <strong className="text-amber-700">
                {abiertas.length} incidencia{abiertas.length === 1 ? "" : "s"}{" "}
                sigue{abiertas.length === 1 ? "" : "n"} abierta
                {abiertas.length === 1 ? "" : "s"}.
              </strong>
            </>
          )}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          Incidencias en máquina
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Folio</th>
                <th className="px-3 py-2 font-medium">Abierta</th>
                <th className="px-3 py-2 font-medium">Máquina</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Qué pasó</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {incidencias.map((i) => (
                <tr key={i.id} className="hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500">
                    {i.folio ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {fmtCDMX(i.fecha_apertura, {
                      day: "2-digit",
                      month: "short",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">
                      {i.maquina ?? i.serie}
                    </div>
                    <div className="text-xs text-zinc-500">{i.ubicacion}</div>
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{i.tipo}</td>
                  <td className="max-w-md px-3 py-2 text-zinc-600">
                    {i.descripcion ?? "—"}
                    {i.notas_resolucion && (
                      <div className="mt-1 text-xs text-green-700">
                        Resolución: {i.notas_resolucion}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Estado valor={i.estado} />
                  </td>
                </tr>
              ))}
              {incidencias.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    Sin incidencias registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          Quejas de usuarios
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Folio</th>
                <th className="px-3 py-2 font-medium">Reportada</th>
                <th className="px-3 py-2 font-medium">Máquina</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Qué reportó</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {quejas.map((q) => (
                <tr key={q.id} className="hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500">
                    {q.folio ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {fmtCDMX(q.fecha_reporte, {
                      day: "2-digit",
                      month: "short",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">
                      {q.maquina ?? q.serie}
                    </div>
                    <div className="text-xs text-zinc-500">{q.ubicacion}</div>
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{q.tipo}</td>
                  <td className="max-w-md px-3 py-2 text-zinc-600">
                    {q.descripcion ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Estado valor={q.estado} />
                  </td>
                </tr>
              ))}
              {quejas.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    Sin quejas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">
          Por protección de datos, el contacto de quien reportó no se muestra.
        </p>
      </section>
    </div>
  );
}

function Estado({ valor }: { valor: string }) {
  const cerrada = valor === "cerrada" || valor === "pagada";
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
        cerrada ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
      }`}
    >
      {valor}
    </span>
  );
}
