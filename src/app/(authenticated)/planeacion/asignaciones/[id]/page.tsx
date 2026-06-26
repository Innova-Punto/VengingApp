import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { urgenciaUltimaVisita } from "@/lib/maquinas-visita";
import { createClient } from "@/lib/supabase/server";

import {
  cambiarEstadoAsig,
  quitarMaquinaDeAsig,
} from "../actions";
import { generarSurtido } from "../../surtidos/actions";
import AgregarMaquinaExcepcionForm from "./AgregarMaquinaExcepcionForm";

export const metadata = { title: "Detalle asignación · Innovaypunto" };

const ESTADO_BADGE: Record<string, string> = {
  planeada: "bg-blue-100 text-blue-700",
  surtida: "bg-indigo-100 text-indigo-700",
  en_jornada: "bg-amber-100 text-amber-700",
  completada: "bg-green-100 text-green-700",
  completada_parcialmente: "bg-orange-100 text-orange-700",
  cancelada: "bg-zinc-200 text-zinc-700",
};

export default async function DetalleAsigPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion", "planeador");

  const supabase = createClient();

  const { data: asig, error } = await supabase
    .from("asignaciones_diarias")
    .select(
      `id, fecha, estado, notas,
       ruta:rutas(id, nombre, color_hex, descripcion),
       operador:profiles!asignaciones_diarias_operador_id_fkey(id, full_name)`,
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!asig) notFound();

  const ruta = Array.isArray(asig.ruta) ? asig.ruta[0] : asig.ruta;
  const operador = Array.isArray(asig.operador)
    ? asig.operador[0]
    : asig.operador;

  const { data: asigMaquinas } = await supabase
    .from("asignacion_maquinas")
    .select(
      `id, orden, origen, motivo_excepcion, notas,
       maquina:maquinas(
         id, serie, alias, estado, ultima_visita_at,
         ubicacion:ubicaciones(nombre, cliente:clientes(nombre))
       )`,
    )
    .eq("asignacion_id", params.id)
    .order("orden");

  // ¿Ya existe surtido para esta asignación?
  const { data: surtidoExistente } = await supabase
    .from("surtidos")
    .select("id, folio, estado")
    .eq("asignacion_id", params.id)
    .maybeSingle();

  // Máquinas disponibles para agregar (operativas, no incluidas todavía)
  const idsActuales = new Set(
    (asigMaquinas ?? []).map((am) => {
      const m = Array.isArray(am.maquina) ? am.maquina[0] : am.maquina;
      return m?.id;
    }),
  );
  const { data: todas } = await supabase
    .from("maquinas")
    .select(
      `id, serie, alias, estado, ultima_visita_at,
       ubicacion:ubicaciones(nombre, cliente:clientes(nombre))`,
    )
    .eq("estado", "operativa")
    .order("serie");

  const disponibles = (todas ?? [])
    .filter((m) => !idsActuales.has(m.id))
    .map((m) => {
      const ubic = Array.isArray(m.ubicacion) ? m.ubicacion[0] : m.ubicacion;
      const cliente = ubic
        ? Array.isArray(ubic.cliente)
          ? ubic.cliente[0]
          : ubic.cliente
        : null;
      return {
        id: m.id,
        serie: m.serie,
        alias: m.alias,
        cliente_nombre: cliente?.nombre ?? "—",
        ubicacion_nombre: ubic?.nombre ?? "—",
        ultima_visita_at: m.ultima_visita_at,
      };
    });

  const transiciones: Record<string, { label: string; siguiente: string }[]> =
    {
      planeada: [
        { label: "Cancelar", siguiente: "cancelada" },
      ],
      surtida: [
        { label: "Cancelar", siguiente: "cancelada" },
      ],
      en_jornada: [],
      completada: [],
      cancelada: [
        { label: "Reactivar como planeada", siguiente: "planeada" },
      ],
    };

  const acciones = transiciones[asig.estado] ?? [];

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/planeacion/asignaciones"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Asignaciones
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div
            className="h-8 w-2 rounded-sm"
            style={{ backgroundColor: ruta?.color_hex ?? "#a1a1aa" }}
          />
          <h1 className="text-2xl font-semibold tracking-tight">
            {ruta?.nombre}
          </h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              ESTADO_BADGE[asig.estado] ?? "bg-zinc-100"
            }`}
          >
            {asig.estado}
          </span>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Fecha" value={asig.fecha} />
        <Stat label="Operador" value={operador?.full_name ?? "—"} />
        <Stat
          label="Máquinas"
          value={String((asigMaquinas ?? []).length)}
        />
      </section>

      <section className="flex flex-wrap gap-2">
        {acciones.map((a) => (
          <form key={a.siguiente} action={cambiarEstadoAsig}>
            <input type="hidden" name="id" value={params.id} />
            <input type="hidden" name="estado" value={a.siguiente} />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {a.label}
            </button>
          </form>
        ))}

        {asig.estado === "planeada" &&
          !surtidoExistente &&
          (asigMaquinas ?? []).length > 0 && (
            <form action={generarSurtido}>
              <input type="hidden" name="asignacion_id" value={params.id} />
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
              >
                Generar surtido sugerido
              </button>
            </form>
          )}

        {surtidoExistente && (
          <Link
            href={`/planeacion/surtidos/${surtidoExistente.id}`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Ver surtido {surtidoExistente.folio} ({surtidoExistente.estado})
          </Link>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Máquinas a visitar
          </h2>
          <p className="text-sm text-zinc-600">
            Las marcadas como excepción se agregaron fuera de la ruta base
            (ej. operador cubriendo a un compañero).
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-center font-medium w-16">
                  Orden
                </th>
                <th className="px-3 py-2 font-medium">Serie</th>
                <th className="px-3 py-2 font-medium">Cliente / Ubicación</th>
                <th className="px-3 py-2 font-medium">Última visita</th>
                <th className="px-3 py-2 font-medium">Origen</th>
                <th className="px-3 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(asigMaquinas ?? []).map((am) => {
                const m = Array.isArray(am.maquina)
                  ? am.maquina[0]
                  : am.maquina;
                const ubic = m
                  ? Array.isArray(m.ubicacion)
                    ? m.ubicacion[0]
                    : m.ubicacion
                  : null;
                const cliente = ubic
                  ? Array.isArray(ubic.cliente)
                    ? ubic.cliente[0]
                    : ubic.cliente
                  : null;
                const esExcepcion = am.origen === "agregada_excepcion";
                return (
                  <tr key={am.id}>
                    <td className="px-3 py-2 text-center font-mono">
                      {am.orden}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs font-medium">
                        {m?.serie}
                      </div>
                      {m?.alias && (
                        <div className="text-xs text-zinc-500">
                          {m.alias}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">
                      {cliente?.nombre ?? "—"}
                      {ubic?.nombre && (
                        <div className="text-xs text-zinc-500">
                          {ubic.nombre}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const u = urgenciaUltimaVisita(m?.ultima_visita_at);
                        return (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${u.badgeClass}`}
                            title={
                              m?.ultima_visita_at
                                ? new Date(m.ultima_visita_at).toLocaleString(
                                    "es-MX",
                                  )
                                : "Sin visita registrada"
                            }
                          >
                            {u.textoCorto}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      {esExcepcion ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            excepción
                          </span>
                          <div className="text-xs text-zinc-500">
                            {am.motivo_excepcion}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500">
                          base ruta
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={quitarMaquinaDeAsig} className="inline">
                        <input type="hidden" name="id" value={am.id} />
                        <input
                          type="hidden"
                          name="asignacion_id"
                          value={params.id}
                        />
                        <button
                          type="submit"
                          className="text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          Quitar
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {(asigMaquinas ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    Sin máquinas. Agrega al menos una para que el operador
                    pueda surtir.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {asig.estado === "planeada" && disponibles.length > 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4">
            <h3 className="mb-3 text-sm font-medium text-zinc-700">
              Agregar máquina por excepción
            </h3>
            <AgregarMaquinaExcepcionForm
              asignacionId={params.id}
              maquinas={disponibles}
            />
          </div>
        )}
      </section>

      {asig.notas && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Notas</h2>
          <p className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600 whitespace-pre-wrap">
            {asig.notas}
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-zinc-900 tabular-nums">
        {value}
      </div>
    </div>
  );
}
