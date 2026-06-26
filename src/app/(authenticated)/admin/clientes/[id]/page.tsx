import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import ClienteForm from "../ClienteForm";
import { toggleActivoUbicacion } from "../actions";

export const metadata = { title: "Editar cliente · Innovaypunto" };

export default async function EditarClientePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion");

  const supabase = createClient();

  const [
    { data: cliente, error },
    { data: ubicaciones },
  ] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("ubicaciones")
      .select(
        "id, nombre, direccion, colonia, ciudad, estado, cp, lat, lng, radio_geofence_m, horario_apertura, horario_cierre, activo",
      )
      .eq("cliente_id", params.id)
      .order("activo", { ascending: false })
      .order("nombre"),
  ]);

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!cliente) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/clientes"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {cliente.nombre}
        </h1>
        {cliente.razon_social && (
          <p className="text-sm text-zinc-500">{cliente.razon_social}</p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Información general
        </h2>
        <div className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6">
          <ClienteForm mode="editar" cliente={cliente} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Ubicaciones
            </h2>
            <p className="text-sm text-zinc-600">
              Lugares físicos donde están instaladas las máquinas.
            </p>
          </div>
          <Link
            href={`/admin/clientes/${params.id}/ubicaciones/nuevo`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Agregar ubicación
          </Link>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Dirección</th>
                <th className="px-4 py-2 font-medium">Ciudad</th>
                <th className="px-4 py-2 text-center font-medium">GPS</th>
                <th className="px-4 py-2 font-medium">Horario</th>
                <th className="px-4 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(ubicaciones ?? []).map((u) => (
                <tr key={u.id} className={u.activo ? "" : "opacity-50"}>
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    <Link
                      href={`/admin/clientes/${params.id}/ubicaciones/${u.id}`}
                      className="hover:underline"
                    >
                      {u.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {u.direccion ?? "—"}
                    {u.colonia && (
                      <div className="text-xs text-zinc-500">
                        Col. {u.colonia}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {u.ciudad ?? "—"}
                    {u.estado && (
                      <div className="text-xs text-zinc-500">{u.estado}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {u.lat !== null && u.lng !== null ? (
                      <span
                        className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                        title={`${u.lat}, ${u.lng} (radio ${u.radio_geofence_m}m)`}
                      >
                        ✓
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs tabular-nums text-zinc-600">
                    {u.horario_apertura && u.horario_cierre
                      ? `${u.horario_apertura.slice(0, 5)}–${u.horario_cierre.slice(0, 5)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/admin/clientes/${params.id}/ubicaciones/${u.id}`}
                        className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                      >
                        Editar
                      </Link>
                      <form
                        action={toggleActivoUbicacion}
                        className="inline"
                      >
                        <input type="hidden" name="id" value={u.id} />
                        <input
                          type="hidden"
                          name="cliente_id"
                          value={params.id}
                        />
                        <input
                          type="hidden"
                          name="activo"
                          value={u.activo ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                        >
                          {u.activo ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {(ubicaciones ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    Este cliente aún no tiene ubicaciones.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
