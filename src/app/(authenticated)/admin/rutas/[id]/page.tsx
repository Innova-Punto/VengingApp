import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import RutaForm from "../RutaForm";
import AgregarMaquinaForm from "../AgregarMaquinaForm";
import { quitarMaquinaDeRuta } from "../actions";

export const metadata = { title: "Editar ruta · MuscleUp" };

export default async function EditarRutaPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion", "planeador");

  const supabase = createClient();

  const { data: ruta, error } = await supabase
    .from("rutas")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!ruta) notFound();

  // Operadores con rol operador
  const { data: rolesRows } = await supabase
    .from("user_roles")
    .select("user_id, profile:profiles(id, full_name)")
    .eq("role", "operador");
  const operadores = (rolesRows ?? [])
    .map((r) => {
      const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      return p ? { id: p.id, full_name: p.full_name } : null;
    })
    .filter((p): p is { id: string; full_name: string } => p !== null);

  // Máquinas ya asignadas a esta ruta (con su orden)
  const { data: rutaMaquinas } = await supabase
    .from("ruta_maquinas")
    .select(
      `maquina_id, orden,
       maquina:maquinas(
         id, serie, alias, estado,
         ubicacion:ubicaciones(nombre, cliente:clientes(nombre))
       )`,
    )
    .eq("ruta_id", params.id)
    .order("orden");

  // Máquinas operativas que NO tienen ruta asignada todavía
  const { data: todasMaquinas } = await supabase
    .from("maquinas")
    .select(
      `id, serie, alias, estado,
       ubicacion:ubicaciones(nombre, cliente:clientes(nombre)),
       ruta_maquinas(ruta_id)`,
    )
    .eq("estado", "operativa")
    .order("serie");

  const disponibles = (todasMaquinas ?? [])
    .filter(
      (m) => !Array.isArray(m.ruta_maquinas) || m.ruta_maquinas.length === 0,
    )
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
      };
    });

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/rutas"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Rutas
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <div
            className="h-8 w-2 rounded-sm"
            style={{ backgroundColor: ruta.color_hex ?? "#a1a1aa" }}
          />
          <h1 className="text-2xl font-semibold tracking-tight">
            {ruta.nombre}
          </h1>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Información general
        </h2>
        <div className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-6">
          <RutaForm mode="editar" ruta={ruta} operadores={operadores} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Máquinas</h2>
          <p className="text-sm text-zinc-600">
            Orden sugerido de visita. Una máquina solo puede pertenecer a una
            ruta a la vez.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-center font-medium w-16">
                  Orden
                </th>
                <th className="px-3 py-2 font-medium">Serie / Alias</th>
                <th className="px-3 py-2 font-medium">Cliente / Ubicación</th>
                <th className="px-3 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(rutaMaquinas ?? []).map((rm) => {
                const m = Array.isArray(rm.maquina)
                  ? rm.maquina[0]
                  : rm.maquina;
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
                return (
                  <tr key={rm.maquina_id}>
                    <td className="px-3 py-2 text-center font-mono">
                      {rm.orden}
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
                    <td className="px-3 py-2 text-right">
                      <form action={quitarMaquinaDeRuta} className="inline">
                        <input
                          type="hidden"
                          name="ruta_id"
                          value={params.id}
                        />
                        <input
                          type="hidden"
                          name="maquina_id"
                          value={rm.maquina_id}
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
              {(rutaMaquinas ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    Esta ruta aún no tiene máquinas asignadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-700">
            Agregar máquina
          </h3>
          {disponibles.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No hay máquinas operativas disponibles (todas están en otra
              ruta o en estado distinto a operativa).
            </p>
          ) : (
            <AgregarMaquinaForm
              rutaId={params.id}
              maquinas={disponibles}
            />
          )}
        </div>
      </section>
    </div>
  );
}
