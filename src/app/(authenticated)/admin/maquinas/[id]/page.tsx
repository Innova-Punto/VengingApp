import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { duplicarMaquina } from "../actions";
import MaquinaForm from "../MaquinaForm";
import TolvaRow from "../TolvaRow";
import AplicarPlanograma from "../AplicarPlanograma";

export const metadata = { title: "Editar máquina · MuscleUp" };

const ESTADO_BADGE: Record<string, string> = {
  operativa: "bg-green-100 text-green-700",
  mantenimiento: "bg-amber-100 text-amber-700",
  baja: "bg-zinc-200 text-zinc-700",
};

export default async function EditarMaquinaPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion");

  const supabase = createClient();

  const [
    { data: maquina, error },
    { data: tolvas },
    { data: productos },
    { data: ubicacionesRaw },
    { data: planogramasRaw },
    { data: vasos },
  ] = await Promise.all([
    supabase
      .from("maquinas")
      .select(
        `*, ubicacion:ubicaciones(id, nombre, cliente:clientes(id, nombre))`,
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("tolvas")
      .select(
        "id, numero, producto_id, gramaje_servicio, precio_venta, nayax_item_code, inventario_actual_g, capacidad_max_g",
      )
      .eq("maquina_id", params.id)
      .order("numero"),
    supabase
      .from("productos")
      .select("id, sku, nombre, gramaje_servicio_default, precio_venta_default")
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("ubicaciones")
      .select("id, nombre, cliente:clientes(nombre)")
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("planogramas")
      .select("id, nombre, num_tolvas, items:planograma_items(id)")
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("productos")
      .select("id, sku, nombre")
      .eq("activo", true)
      .eq("tipo", "vaso")
      .order("nombre"),
  ]);

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!maquina) notFound();

  const ubicaciones = (ubicacionesRaw ?? []).map((u) => {
    const cliente = Array.isArray(u.cliente) ? u.cliente[0] : u.cliente;
    return {
      id: u.id,
      nombre: u.nombre,
      cliente_nombre: cliente?.nombre ?? "(sin cliente)",
    };
  });

  const planogramas = (planogramasRaw ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    num_tolvas: p.num_tolvas,
    items_count: Array.isArray(p.items) ? p.items.length : 0,
  }));

  const ubic = Array.isArray(maquina.ubicacion)
    ? maquina.ubicacion[0]
    : maquina.ubicacion;
  const cliente = ubic
    ? Array.isArray(ubic.cliente)
      ? ubic.cliente[0]
      : ubic.cliente
    : null;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/maquinas"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Máquinas
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {maquina.serie}
          </h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              ESTADO_BADGE[maquina.estado] ?? "bg-zinc-100"
            }`}
          >
            {maquina.estado}
          </span>
        </div>
        {maquina.alias && (
          <p className="text-sm text-zinc-600">{maquina.alias}</p>
        )}
        {cliente && (
          <p className="text-xs text-zinc-500">
            {cliente.nombre} · {ubic?.nombre}
          </p>
        )}
        <div className="mt-3">
          <form action={duplicarMaquina}>
            <input type="hidden" name="id" value={maquina.id} />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              title="Crea una nueva máquina copiando su configuración y planograma"
            >
              Duplicar máquina
            </button>
          </form>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Información general
        </h2>
        <div className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6">
          <MaquinaForm
            mode="editar"
            maquina={maquina}
            ubicaciones={ubicaciones}
            vasos={vasos ?? []}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Vasos</h2>
          <p className="text-sm text-zinc-600">
            Consumible independiente del planograma de tolvas. El inventario
            se actualiza en surtidos y ventas.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          {maquina.vaso_producto_id ? (
            <dl className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Tipo
                </dt>
                <dd className="text-sm text-zinc-900">
                  {(vasos ?? []).find((v) => v.id === maquina.vaso_producto_id)
                    ?.nombre ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Capacidad máx.
                </dt>
                <dd className="text-sm tabular-nums text-zinc-900">
                  {maquina.vaso_capacidad_max} vasos
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Inventario actual
                </dt>
                <dd className="text-sm tabular-nums text-zinc-900">
                  {maquina.vaso_inventario_actual}
                  <span className="ml-1 text-zinc-500">
                    /{maquina.vaso_capacidad_max}
                  </span>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-zinc-500">
              No hay tipo de vaso asignado. Asígnalo desde &laquo;Información
              general&raquo;.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Planograma</h2>
          <p className="text-sm text-zinc-600">
            Producto, gramaje de servicio y precio asignado a cada tolva.
            Los cambios quedan registrados en el histórico.
          </p>
        </div>

        <AplicarPlanograma maquinaId={maquina.id} planogramas={planogramas} />

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2 text-center font-medium">Tolva</th>
                <th className="px-2 py-2 font-medium">Configuración</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(tolvas ?? []).map((t) => (
                <TolvaRow
                  key={t.id}
                  maquinaId={maquina.id}
                  tolva={t}
                  productos={productos ?? []}
                />
              ))}
              {(tolvas ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    Las tolvas se crean automáticamente al crear la máquina.
                    Si no aparecen, revisa el trigger
                    trg_maquina_create_tolvas.
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
