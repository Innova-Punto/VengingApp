import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { completarSurtido } from "../actions";
import SurtidoItemRow from "./SurtidoItemRow";

export const metadata = { title: "Detalle surtido · MuscleUp" };

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-blue-100 text-blue-700",
  en_proceso: "bg-amber-100 text-amber-700",
  completado: "bg-green-100 text-green-700",
};

export default async function DetalleSurtidoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  await requireRole("admin", "direccion", "planeador", "almacen");

  const supabase = createClient();

  const { data: surt, error } = await supabase
    .from("surtidos")
    .select(
      `id, folio, fecha, estado, fecha_completado,
       asignacion:asignaciones_diarias!surtidos_asignacion_id_fkey(
         id, fecha,
         ruta:rutas(nombre, color_hex),
         operador:profiles!asignaciones_diarias_operador_id_fkey(full_name)
       )`,
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
  if (!surt) notFound();

  const asig = Array.isArray(surt.asignacion)
    ? surt.asignacion[0]
    : surt.asignacion;
  const ruta = asig
    ? Array.isArray(asig.ruta)
      ? asig.ruta[0]
      : asig.ruta
    : null;
  const op = asig
    ? Array.isArray(asig.operador)
      ? asig.operador[0]
      : asig.operador
    : null;

  const { data: items } = await supabase
    .from("surtido_items")
    .select(
      `id, maquina_id, producto_id,
       cartuchos_sugeridos, cartuchos_entregados,
       vasos_sugeridos, vasos_entregados,
       producto:productos(sku, nombre, tipo),
       maquina:maquinas(serie, alias)`,
    )
    .eq("surtido_id", params.id)
    .order("maquina_id");

  const editable = surt.estado !== "completado";

  // Agrupar por máquina para la presentación
  type ItemRow = NonNullable<typeof items>[number];
  const porMaquina = new Map<string, ItemRow[]>();
  for (const it of items ?? []) {
    const m = Array.isArray(it.maquina) ? it.maquina[0] : it.maquina;
    const key = m?.serie ?? it.maquina_id;
    const arr = porMaquina.get(key) ?? [];
    arr.push(it);
    porMaquina.set(key, arr);
  }

  // Totales
  let totalCartuchos = 0;
  let totalVasos = 0;
  for (const it of items ?? []) {
    totalCartuchos += it.cartuchos_entregados ?? 0;
    totalVasos += it.vasos_entregados ?? 0;
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/planeacion/surtidos"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Surtidos
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div
            className="h-8 w-2 rounded-sm"
            style={{ backgroundColor: ruta?.color_hex ?? "#a1a1aa" }}
          />
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {surt.folio}
          </h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              ESTADO_BADGE[surt.estado] ?? "bg-zinc-100"
            }`}
          >
            {surt.estado}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          {ruta?.nombre} · {op?.full_name} · {asig?.fecha}
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(searchParams.error)}
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Cartuchos a llevar" value={String(totalCartuchos)} />
        <Stat label="Vasos a llevar" value={String(totalVasos)} />
        <Stat
          label="Items"
          value={String((items ?? []).length)}
        />
      </section>

      <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-zinc-700">
          ¿Cómo se calcularon los sugeridos?
        </summary>
        <div className="mt-2 space-y-1 text-xs text-zinc-600">
          <p>
            <strong>Polvos:</strong> por cada tolva configurada, se sugieren
            solo los cartuchos que caben COMPLETOS. Cartuchos = ⌊(capacidad −
            inventario actual) ÷ gramaje del producto⌋. Esto evita que regresen
            cartuchos parcialmente usados al almacén.
          </p>
          <p>
            <strong>Vasos:</strong> capacidad máxima de la máquina menos los
            vasos disponibles.
          </p>
          <p className="text-zinc-500">
            ⚠️ Hoy el inventario de tolvas y vasos en máquina sólo cambia con
            llenados manuales (Fase 7) o pesajes mensuales (Fase 8). Cuando
            integremos Nayax (Fase 9), el sugeridor usará velocidad real de
            consumo × frecuencia de visita.
          </p>
        </div>
      </details>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Items por máquina
        </h2>

        {Array.from(porMaquina.entries()).map(([serie, rows]) => {
          const primera = rows[0];
          const m = primera
            ? Array.isArray(primera.maquina)
              ? primera.maquina[0]
              : primera.maquina
            : null;
          return (
            <div
              key={serie}
              className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
            >
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                <div className="font-mono text-sm font-medium">{serie}</div>
                {m?.alias && (
                  <div className="text-xs text-zinc-500">{m.alias}</div>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Producto</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Cartuchos sug.
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      Cartuchos a llevar
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      Vasos sug.
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      Vasos a llevar
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map((it) => (
                    <SurtidoItemRow
                      key={it.id}
                      item={it}
                      surtidoId={params.id}
                      editable={editable}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {porMaquina.size === 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
            Este surtido no tiene items. Probablemente las tolvas están
            llenas o el sugeridor no detectó necesidad.
          </div>
        )}
      </section>

      {editable && (items ?? []).length > 0 && (
        <section className="rounded-lg border border-green-200 bg-green-50 p-4">
          <h3 className="mb-2 text-sm font-medium text-green-900">
            Completar surtido
          </h3>
          <p className="mb-3 text-xs text-green-800">
            Al completar, se descuenta el inventario (PEPS sobre encartuchados
            y lotes de vasos) y la asignación pasa a estado &laquo;surtida&raquo;.
            Verifica las cantidades antes.
          </p>
          <form action={completarSurtido}>
            <input type="hidden" name="id" value={params.id} />
            <button
              type="submit"
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-green-800"
            >
              Marcar como completado
            </button>
          </form>
        </section>
      )}

      {surt.estado === "completado" && surt.fecha_completado && (
        <p className="text-sm text-zinc-600">
          Completado el{" "}
          {new Date(surt.fecha_completado).toLocaleString("es-MX")}.
        </p>
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
