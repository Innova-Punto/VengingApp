import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Inventario · MuscleUp" };

type SearchParams = { tipo?: string; estado?: string; cliente?: string };

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "almacen", "compras");

  const tipo = searchParams.tipo;
  const estado = searchParams.estado ?? "todos";
  const clienteId = searchParams.cliente || null;

  const supabase = createClient();

  // Lista de clientes para el filtro
  const { data: clientesRaw } = await supabase
    .from("clientes")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre");
  const clientes = clientesRaw ?? [];

  // Si hay filtro de cliente: obtenemos los producto_ids asociados
  // (exclusivos + usados en sus máquinas + vaso de sus máquinas).
  let productosDelCliente: string[] | null = null;
  if (clienteId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prods } = await (supabase as any).rpc(
      "productos_de_cliente",
      { p_cliente_id: clienteId },
    );
    productosDelCliente = ((prods ?? []) as { productos_de_cliente: string }[])
      .map((r) => r.productos_de_cliente)
      .filter(Boolean);
  }

  let query = supabase
    .from("v_inventario_producto")
    .select("*")
    .eq("activo", true)
    .order("bajo_minimo", { ascending: false })
    .order("en_punto_reorden", { ascending: false })
    .order("nombre");

  if (tipo === "polvo" || tipo === "vaso") query = query.eq("tipo", tipo);
  if (productosDelCliente !== null) {
    if (productosDelCliente.length === 0) {
      // ningún producto matchea → forzar conjunto vacío
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("id", productosDelCliente);
    }
  }

  const [{ data: filasRaw, error }, { data: capitalRow }] = await Promise.all([
    query,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("capital_trabajo", {
      p_cliente_id: clienteId,
    }).single(),
  ]);

  const cap = (capitalRow ?? {}) as {
    alm_granel_valor?: number;
    alm_granel_gramos?: number;
    alm_cartuchos_valor?: number;
    alm_cartuchos_unidades?: number;
    alm_cartuchos_gramos?: number;
    alm_vasos_valor?: number;
    alm_vasos_unidades?: number;
    maq_polvo_valor?: number;
    maq_polvo_gramos?: number;
    maq_vasos_valor?: number;
    maq_vasos_unidades?: number;
    almacen_total?: number;
    maquinas_total?: number;
    capital_total?: number;
  };
  let filas = filasRaw ?? [];

  if (estado === "criticos") {
    filas = filas.filter((r) => r.bajo_minimo);
  } else if (estado === "reordenar") {
    filas = filas.filter((r) => r.bajo_minimo || r.en_punto_reorden);
  }

  // Contadores
  const criticos = (filasRaw ?? []).filter((r) => r.bajo_minimo).length;
  const enReorden = (filasRaw ?? []).filter((r) => r.en_punto_reorden).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
        <p className="text-sm text-zinc-600">
          Stock disponible por producto (granel + cartuchos en almacén). Los
          mínimos y punto de reorden se configuran en cada producto.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Capital de trabajo · tiempo real
              {clienteId && (
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">
                  {clientes.find((c) => c.id === clienteId)?.nombre ?? "Cliente"}
                </span>
              )}
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-zinc-900">
              {fmtMXN(cap.capital_total)}
            </div>
            <div className="text-xs text-zinc-500">Al costo promedio actual</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CapitalBlock
              titulo="Almacén"
              total={cap.almacen_total}
              tone="zinc"
              detalles={[
                {
                  label: "Granel",
                  valor: cap.alm_granel_valor,
                  sub: `${fmtNum(cap.alm_granel_gramos)} g`,
                },
                {
                  label: "Cartuchos",
                  valor: cap.alm_cartuchos_valor,
                  sub: `${fmtNum(cap.alm_cartuchos_unidades)} cart · ${fmtNum(cap.alm_cartuchos_gramos)} g`,
                },
                {
                  label: "Vasos",
                  valor: cap.alm_vasos_valor,
                  sub: `${fmtNum(cap.alm_vasos_unidades)} u`,
                },
              ]}
            />
            <CapitalBlock
              titulo="En máquinas"
              total={cap.maquinas_total}
              tone="amber"
              detalles={[
                {
                  label: "Polvo en tolvas",
                  valor: cap.maq_polvo_valor,
                  sub: `${fmtNum(cap.maq_polvo_gramos)} g`,
                },
                {
                  label: "Vasos",
                  valor: cap.maq_vasos_valor,
                  sub: `${fmtNum(cap.maq_vasos_unidades)} u`,
                },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Productos activos" value={(filasRaw ?? []).length} />
        <StatCard
          label="En punto de reorden"
          value={enReorden}
          color={enReorden > 0 ? "amber" : undefined}
        />
        <StatCard
          label="Bajo mínimo (crítico)"
          value={criticos}
          color={criticos > 0 ? "red" : undefined}
        />
      </section>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
      >
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Cliente
          </label>
          <select
            name="cliente"
            defaultValue={clienteId ?? ""}
            className="mt-1 w-48 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Tipo
          </label>
          <select
            name="tipo"
            defaultValue={tipo ?? ""}
            className="mt-1 w-36 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">Todos</option>
            <option value="polvo">Polvo</option>
            <option value="vaso">Vaso</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Estado
          </label>
          <select
            name="estado"
            defaultValue={estado}
            className="mt-1 w-48 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="todos">Todos</option>
            <option value="reordenar">Reordenar o críticos</option>
            <option value="criticos">Solo críticos</option>
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
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 text-right font-medium">Granel</th>
              <th className="px-3 py-2 text-right font-medium">Cartuchos</th>
              <th className="px-3 py-2 text-right font-medium">
                Stock total
              </th>
              <th className="px-3 py-2 text-right font-medium">Mín</th>
              <th className="px-3 py-2 text-right font-medium">Reorden</th>
              <th className="px-3 py-2 text-right font-medium">Máx</th>
              <th className="px-3 py-2 text-right font-medium">A pedir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filas.map((r) => {
              const unidad = r.tipo === "polvo" ? "g" : "u";
              const stock = Number(r.stock_total ?? 0);
              const aPedir = Math.max(0, Number(r.stock_maximo ?? 0) - stock);
              const semaforo = r.bajo_minimo
                ? "bg-red-100 text-red-700"
                : r.en_punto_reorden
                  ? "bg-amber-100 text-amber-700"
                  : "bg-green-100 text-green-700";
              const semaforoLbl = r.bajo_minimo
                ? "CRÍTICO"
                : r.en_punto_reorden
                  ? "REORDEN"
                  : "OK";
              return (
                <tr key={r.id ?? ""} className="hover:bg-zinc-50">
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${semaforo}`}
                    >
                      {semaforoLbl}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/productos/${r.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {r.nombre}
                    </Link>
                    <div className="font-mono text-xs text-zinc-500">
                      {r.sku}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs uppercase text-zinc-600">
                      {r.tipo}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {r.tipo === "polvo"
                      ? `${Number(r.gramos_granel).toLocaleString()} g`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {r.tipo === "polvo"
                      ? `${r.cartuchos_disponibles}`
                      : `${r.unidades_disponibles}`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {Number(stock).toLocaleString()} {unidad}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-500">
                    {Number(r.stock_minimo).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-500">
                    {Number(r.punto_reorden).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-500">
                    {Number(r.stock_maximo).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {aPedir > 0 ? (
                      <span className="font-medium text-zinc-900">
                        {aPedir.toLocaleString()} {unidad}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filas.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No hay productos que cumplan los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        El stock total de polvos suma granel + cartuchos disponibles
        (expresado como gramos equivalentes). Configura mínimos y máximos en
        el detalle de cada producto.
      </p>
    </div>
  );
}

function fmtMXN(v: number | undefined | null): string {
  const n = Number(v ?? 0);
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(v: number | undefined | null): string {
  return Number(v ?? 0).toLocaleString("es-MX");
}

function CapitalBlock({
  titulo,
  total,
  tone,
  detalles,
}: {
  titulo: string;
  total: number | undefined;
  tone: "zinc" | "amber";
  detalles: { label: string; valor: number | undefined; sub: string }[];
}) {
  const toneCls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : "border-zinc-200 bg-zinc-50";
  return (
    <div className={`rounded-md border ${toneCls} px-3 py-2 min-w-[220px]`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {titulo}
        </div>
        <div className="text-base font-semibold tabular-nums text-zinc-900">
          {fmtMXN(total)}
        </div>
      </div>
      <div className="mt-1 space-y-0.5">
        {detalles.map((d) => (
          <div
            key={d.label}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <div>
              <span className="text-zinc-600">{d.label}</span>
              <span className="ml-1 text-[10px] text-zinc-400">{d.sub}</span>
            </div>
            <span className="tabular-nums text-zinc-700">{fmtMXN(d.valor)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "amber" | "red";
}) {
  const cls =
    color === "red"
      ? "border-red-200 bg-red-50"
      : color === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-zinc-200 bg-white";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
