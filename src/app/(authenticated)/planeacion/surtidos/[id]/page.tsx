import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import { completarSurtido } from "../actions";
import AgregarItemForm from "./AgregarItemForm";
import SurtidoItemRow from "./SurtidoItemRow";

export const metadata = { title: "Detalle surtido · Innovaypunto" };

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

  // Trae todas las máquinas de la asignación (no solo las que el sugeridor llenó)
  // junto con sus tolvas y vaso, para construir la lista de productos
  // disponibles para agregar manualmente por máquina.
  const { data: asigMaquinas } = await supabase
    .from("asignacion_maquinas")
    .select(
      `orden,
       maquina:maquinas(
         id, serie, alias, vaso_producto_id,
         tolvas:tolvas(producto_id)
       )`,
    )
    .eq("asignacion_id", asig?.id ?? "")
    .order("orden");

  // Recolecta productos referenciados por tolvas o vasos de las máquinas
  const productoIds = new Set<string>();
  for (const am of asigMaquinas ?? []) {
    const m = Array.isArray(am.maquina) ? am.maquina[0] : am.maquina;
    if (!m) continue;
    if (m.vaso_producto_id) productoIds.add(m.vaso_producto_id);
    const tolvas = Array.isArray(m.tolvas) ? m.tolvas : [];
    for (const t of tolvas) {
      if (t.producto_id) productoIds.add(t.producto_id);
    }
  }
  const { data: productos } =
    productoIds.size > 0
      ? await supabase
          .from("productos")
          .select("id, sku, nombre, tipo")
          .in("id", Array.from(productoIds))
      : { data: [] };
  type Producto = { id: string; sku: string; nombre: string; tipo: "polvo" | "vaso" };
  const productoById = new Map<string, Producto>(
    ((productos ?? []) as Producto[]).map((p) => [p.id, p]),
  );

  // Productos ya presentes en el surtido por máquina (para excluirlos del select)
  type ItemRow = NonNullable<typeof items>[number];
  const itemsPorMaquinaId = new Map<string, ItemRow[]>();
  const productosUsadosPorMaquina = new Map<string, Set<string>>();
  for (const it of items ?? []) {
    const arr = itemsPorMaquinaId.get(it.maquina_id) ?? [];
    arr.push(it);
    itemsPorMaquinaId.set(it.maquina_id, arr);
    const usados = productosUsadosPorMaquina.get(it.maquina_id) ?? new Set<string>();
    usados.add(it.producto_id);
    productosUsadosPorMaquina.set(it.maquina_id, usados);
  }

  // Totales
  let totalCartuchos = 0;
  let totalVasos = 0;
  for (const it of items ?? []) {
    totalCartuchos += it.cartuchos_entregados ?? 0;
    totalVasos += it.vasos_entregados ?? 0;
  }

  // Costo estimado del surtido (orientativo, no exacto):
  // promedio ponderado de costo_promedio_g × gramos_por_cartucho de los
  // encartuchados disponibles del producto. No incluye vasos (su costo se
  // resuelve por presentación en PEPS al completar). El costo real queda
  // en kardex tras completar el surtido.
  const productoItemIds = Array.from(
    new Set((items ?? []).map((it) => it.producto_id)),
  );

  const { data: encDisp } = productoItemIds.length > 0
    ? await supabase
        .from("encartuchados")
        .select("producto_id, cantidad_disponible, gramos_por_cartucho, costo_promedio_g")
        .in("producto_id", productoItemIds)
        .gt("cantidad_disponible", 0)
    : { data: [] };

  const aggCartucho = new Map<
    string,
    { ponderadoCosto: number; ponderadoGramos: number; peso: number }
  >();
  for (const e of encDisp ?? []) {
    const a = aggCartucho.get(e.producto_id) ?? {
      ponderadoCosto: 0,
      ponderadoGramos: 0,
      peso: 0,
    };
    const w = e.cantidad_disponible ?? 0;
    a.ponderadoCosto += (e.costo_promedio_g ?? 0) * w;
    a.ponderadoGramos += (e.gramos_por_cartucho ?? 0) * w;
    a.peso += w;
    aggCartucho.set(e.producto_id, a);
  }
  const costoCartuchoEstPorProducto = new Map<string, number>();
  aggCartucho.forEach((a, pid) => {
    if (a.peso > 0) {
      const costoG = a.ponderadoCosto / a.peso;
      const gramosCartucho = a.ponderadoGramos / a.peso;
      costoCartuchoEstPorProducto.set(pid, costoG * gramosCartucho);
    }
  });

  let costoEstimado = 0;
  for (const it of items ?? []) {
    const cc = costoCartuchoEstPorProducto.get(it.producto_id) ?? 0;
    costoEstimado += cc * (it.cartuchos_entregados ?? 0);
  }
  const costoEstimadoMxn = Math.round(costoEstimado * 100) / 100;

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

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Cartuchos a llevar" value={String(totalCartuchos)} />
        <Stat label="Vasos a llevar" value={String(totalVasos)} />
        <Stat label="Items" value={String((items ?? []).length)} />
        <Stat
          label="Costo estimado"
          value={`$${costoEstimadoMxn.toLocaleString("es-MX", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          hint="Solo cartuchos (polvo). Promedio del inventario disponible. El costo real se aplica con PEPS al completar."
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/planeacion/surtidos/${params.id}/imprimir`}
          target="_blank"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          Imprimir packing list
        </Link>
      </div>

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

        {(asigMaquinas ?? []).map((am) => {
          const m = Array.isArray(am.maquina) ? am.maquina[0] : am.maquina;
          if (!m) return null;
          const rows = itemsPorMaquinaId.get(m.id) ?? [];

          // Productos disponibles para agregar manualmente:
          // los de las tolvas + el vaso de la máquina, menos los ya presentes
          const posibles = new Set<string>();
          if (m.vaso_producto_id) posibles.add(m.vaso_producto_id);
          const tolvas = Array.isArray(m.tolvas) ? m.tolvas : [];
          for (const t of tolvas) {
            if (t.producto_id) posibles.add(t.producto_id);
          }
          const usados = productosUsadosPorMaquina.get(m.id) ?? new Set<string>();
          const disponibles = Array.from(posibles)
            .filter((p) => !usados.has(p))
            .map((id) => productoById.get(id))
            .filter((p): p is Producto => Boolean(p));

          return (
            <div
              key={m.id}
              className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
            >
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                <div className="font-mono text-sm font-medium">{m.serie}</div>
                {m.alias && (
                  <div className="text-xs text-zinc-500">{m.alias}</div>
                )}
              </div>
              {rows.length > 0 ? (
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
              ) : (
                <div className="px-4 py-3 text-xs text-zinc-500">
                  El sugeridor no detectó necesidad para esta máquina.
                </div>
              )}
              {editable && (
                <AgregarItemForm
                  surtidoId={params.id}
                  maquinaId={m.id}
                  productos={disponibles}
                />
              )}
            </div>
          );
        })}

        {(asigMaquinas ?? []).length === 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
            La asignación no tiene máquinas.
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
          {fmtCDMX(surt.fecha_completado)}.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-zinc-900 tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] text-zinc-500">{hint}</div>}
    </div>
  );
}
