import { requireRole } from "@/lib/auth";
import {
  fmtCDMXFechaHora,
  startOfNDaysAgoCDMX,
  startOfTodayCDMX,
} from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import VentasFilters from "./VentasFilters";
import { IngresosPorDiaChart, VentasPorClienteChart } from "./Charts";

export const metadata = { title: "Ventas · Innovaypunto" };

type SearchParams = {
  rango?: string;
  desde?: string;
  hasta?: string;
  maquina?: string;
  cliente?: string;
  ubicacion?: string;
  producto?: string;
  metodo?: string;
  utilidad?: "todas" | "negativas";
  page?: string;
  top_maquinas?: "all";
  top_productos?: "all";
};

const PAGE_SIZE = 50;

const RANGOS: Record<string, { label: string; dias: number }> = {
  hoy: { label: "Hoy", dias: 1 },
  "7d": { label: "Últimos 7 días", dias: 7 },
  "30d": { label: "Últimos 30 días", dias: 30 },
  "90d": { label: "Últimos 90 días", dias: 90 },
};

function rangoFechas(sp: SearchParams): { desde: Date; hasta: Date; label: string } {
  if (sp.desde && sp.hasta) {
    // Rangos personalizados (YYYY-MM-DD) en CDMX: desde 00:00 a 23:59 CDMX
    return {
      desde: new Date(`${sp.desde}T00:00:00-06:00`),
      hasta: new Date(`${sp.hasta}T23:59:59-06:00`),
      label: "Personalizado",
    };
  }
  const key = sp.rango ?? "hoy";
  if (key === "ayer") {
    const hoyInicio = startOfTodayCDMX();
    const ayerInicio = new Date(hoyInicio);
    ayerInicio.setUTCDate(ayerInicio.getUTCDate() - 1);
    const ayerFin = new Date(hoyInicio.getTime() - 1);
    return { desde: ayerInicio, hasta: ayerFin, label: "Ayer" };
  }
  const r = RANGOS[key] ?? RANGOS["hoy"];
  const hasta = new Date();
  const desde =
    key === "hoy" ? startOfTodayCDMX() : startOfNDaysAgoCDMX(r.dias);
  return { desde, hasta, label: r.label };
}

function fmtMxn(n: number) {
  return `$${n.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const { desde, hasta, label: rangoLabel } = rangoFechas(searchParams);
  const desdeISO = desde.toISOString();
  const hastaISO = hasta.toISOString();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const utilidadFilter = searchParams.utilidad ?? "todas";

  // Catálogos para los filtros
  const [{ data: maquinasCat }, { data: productosCat }, { data: clientesCat }] =
    await Promise.all([
      supabase
        .from("maquinas")
        .select("id, serie, alias, ubicacion:ubicaciones(id, nombre, cliente:clientes(id, nombre))")
        .eq("activo", true)
        .order("alias"),
      supabase
        .from("productos")
        .select("id, sku, nombre")
        .eq("activo", true)
        .order("nombre"),
      supabase.from("clientes").select("id, nombre").eq("activo", true).order("nombre"),
    ]);

  // Query base de ventas con joins
  let q = supabase
    .from("ventas_maquina")
    .select(
      `id, fecha_transaccion, gramos_dispensados, precio_bruto,
       comision_nayax_estimada, precio_neto, costo_polvo, costo_vaso,
       utilidad_bruta, margen_porcentaje, metodo_pago, ticket_id_nayax,
       notas,
       maquina:maquinas(id, serie, alias,
         ubicacion:ubicaciones(nombre, cliente:clientes(id, nombre))),
       producto:productos(id, sku, nombre),
       tolva:tolvas(numero)`,
      { count: "exact" },
    )
    .gte("fecha_transaccion", desdeISO)
    .lte("fecha_transaccion", hastaISO);

  if (searchParams.cliente) q = q.eq("cliente_id", searchParams.cliente);
  if (searchParams.maquina) q = q.eq("maquina_id", searchParams.maquina);
  if (searchParams.producto) q = q.eq("producto_id", searchParams.producto);
  if (searchParams.metodo) q = q.eq("metodo_pago", searchParams.metodo);
  if (utilidadFilter === "negativas") q = q.lt("utilidad_bruta", 0);

  const { data: ventas, count } = await q
    .order("fecha_transaccion", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  // KPIs y agregaciones se calculan EN LA BASE DE DATOS (RPC) para no chocar
  // con el límite de filas de PostgREST (1000) que truncaba los totales.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aggData } = await (supabase as any).rpc("agregar_ventas", {
    p_desde: desdeISO,
    p_hasta: hastaISO,
    p_cliente_id: searchParams.cliente ?? null,
    p_maquina_id: searchParams.maquina ?? null,
    p_producto_id: searchParams.producto ?? null,
    p_metodo: searchParams.metodo ?? null,
    p_solo_negativas: utilidadFilter === "negativas",
  });

  type AggKpis = {
    n_ventas: number;
    venta_publico: number;
    comision_nayax: number;
    venta_bruta: number;
    costo_polvo: number;
    costo_vaso: number;
    utilidad: number;
    gramos: number;
    margen_prom: number;
    ticket_prom: number;
  };
  const agg = (aggData ?? {}) as {
    kpis?: AggKpis;
    por_dia?: { fecha: string; ingresos: number }[];
    por_cliente?: { cliente: string; valor: number }[];
    por_maquina?: {
      filter_id: string;
      serie: string;
      alias: string | null;
      ingresos: number;
      utilidad: number;
      ventas: number;
    }[];
    por_producto?: {
      sku: string;
      nombre: string;
      filter_id: string;
      es_receta: boolean;
      ingresos: number;
      utilidad: number;
      ventas: number;
    }[];
  };
  const k = agg.kpis ?? ({} as AggKpis);

  const nVentas = Number(k.n_ventas ?? 0);
  const ventaPublico = Number(k.venta_publico ?? 0);
  const comisionNayax = Number(k.comision_nayax ?? 0);
  const ventaBruta = Number(k.venta_bruta ?? 0);
  const costoPolvo = Number(k.costo_polvo ?? 0);
  const costoVaso = Number(k.costo_vaso ?? 0);
  const utilidad = Number(k.utilidad ?? 0);
  const gramos = Number(k.gramos ?? 0);
  const margenProm = Number(k.margen_prom ?? 0);
  const ticketProm = Number(k.ticket_prom ?? 0);

  const dataPorDia = (agg.por_dia ?? []).map((d) => ({
    fecha: d.fecha,
    ingresos: Number(d.ingresos ?? 0),
  }));

  const dataPorCliente = (agg.por_cliente ?? []).map((c) => ({
    cliente: c.cliente,
    valor: Number(c.valor ?? 0),
  }));

  type TopRow = {
    key: string;
    label: string;
    sublabel?: string;
    ingresos: number;
    ventas: number;
    utilidad: number;
    /** id para usar en el link de drill-down (filtro de tabla detalle). */
    filterId: string;
  };
  const maquinasOrdenadas: TopRow[] = (agg.por_maquina ?? []).map((m) => ({
    key: m.serie ?? m.filter_id,
    label: m.alias ?? m.serie,
    sublabel: `#${m.serie}`,
    ingresos: Number(m.ingresos ?? 0),
    utilidad: Number(m.utilidad ?? 0),
    ventas: Number(m.ventas ?? 0),
    filterId: m.filter_id,
  }));
  const showAllMaquinas = searchParams.top_maquinas === "all";
  const maquinasParaMostrar = showAllMaquinas
    ? maquinasOrdenadas
    : maquinasOrdenadas.slice(0, 10);

  const productosOrdenados: TopRow[] = (agg.por_producto ?? []).map((p) => ({
    key: p.es_receta ? `receta:${p.nombre}` : p.sku,
    label: p.nombre,
    sublabel: p.es_receta ? "receta" : p.sku,
    ingresos: Number(p.ingresos ?? 0),
    utilidad: Number(p.utilidad ?? 0),
    ventas: Number(p.ventas ?? 0),
    filterId: p.filter_id ?? "",
  }));
  const showAllProductos = searchParams.top_productos === "all";
  const productosParaMostrar = showAllProductos
    ? productosOrdenados
    : productosOrdenados.slice(0, 10);

  const totalPaginas = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Métodos disponibles (para el filtro) — distinct ligero, pocos valores.
  const { data: metodosRaw } = await supabase
    .from("ventas_maquina")
    .select("metodo_pago")
    .not("metodo_pago", "is", null)
    .limit(1000);
  const metodosDisponibles = Array.from(
    new Set((metodosRaw ?? []).map((v) => v.metodo_pago).filter(Boolean) as string[]),
  ).sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-sm text-zinc-600">
          Análisis de ventas Nayax — {rangoLabel.toLowerCase()}.
        </p>
      </div>

      <VentasFilters
        rango={searchParams.rango ?? "hoy"}
        desde={searchParams.desde ?? ""}
        hasta={searchParams.hasta ?? ""}
        maquina={searchParams.maquina ?? ""}
        cliente={searchParams.cliente ?? ""}
        producto={searchParams.producto ?? ""}
        metodo={searchParams.metodo ?? ""}
        utilidad={utilidadFilter}
        maquinas={(maquinasCat ?? []).map((m) => ({
          id: m.id,
          label: `${m.alias ?? m.serie} (#${m.serie})`,
        }))}
        clientes={(clientesCat ?? []).map((c) => ({ id: c.id, label: c.nombre }))}
        productos={(productosCat ?? []).map((p) => ({
          id: p.id,
          label: `${p.nombre} · ${p.sku}`,
        }))}
        metodos={metodosDisponibles}
      />

      {/* KPIs - desglose Nayax */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Desglose Nayax
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Kpi label="Venta al público" value={fmtMxn(ventaPublico)} />
          <Kpi
            label="Comisión Nayax (3.4% + IVA)"
            value={fmtMxn(comisionNayax)}
            tone="red"
          />
          <Kpi label="Venta bruta (neto en banco)" value={fmtMxn(ventaBruta)} tone="green" />
        </div>
      </section>

      {/* KPIs - operación */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Operación
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
          <Kpi label="Ventas" value={nVentas.toLocaleString("es-MX")} />
          <Kpi label="Costo polvo" value={fmtMxn(costoPolvo)} tone="red" />
          <Kpi label="Costo vaso" value={fmtMxn(costoVaso)} tone="red" />
          <Kpi label="Utilidad" value={fmtMxn(utilidad)} tone="green" />
          <Kpi
            label="Margen promedio"
            value={`${margenProm.toFixed(1)}%`}
            tone={margenProm < 0 ? "red" : "green"}
          />
          <Kpi label="Ticket promedio" value={fmtMxn(ticketProm)} />
          <Kpi label="Gramos" value={`${(gramos / 1000).toFixed(1)} kg`} />
        </div>
      </section>

      {/* Gráficas */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-zinc-700">Venta bruta por día</h3>
          <IngresosPorDiaChart data={dataPorDia} />
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-700">Ventas por cliente</h3>
          <VentasPorClienteChart data={dataPorCliente} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopTabla
          titulo={
            showAllMaquinas
              ? `Todas las máquinas (${maquinasOrdenadas.length})`
              : "Top 10 máquinas"
          }
          rows={maquinasParaMostrar}
          filterParam="maquina"
          searchParams={searchParams}
          mostrarTodosHref={buildToggleHref(searchParams, "top_maquinas", showAllMaquinas)}
          mostrarTodosLabel={showAllMaquinas ? "Ver solo top 10" : "Ver todas"}
          totalDisponible={maquinasOrdenadas.length}
        />
        <TopTabla
          titulo={
            showAllProductos
              ? `Todos los productos (${productosOrdenados.length})`
              : "Top 10 productos"
          }
          rows={productosParaMostrar}
          filterParam="producto"
          searchParams={searchParams}
          mostrarTodosHref={buildToggleHref(searchParams, "top_productos", showAllProductos)}
          mostrarTodosLabel={showAllProductos ? "Ver solo top 10" : "Ver todos"}
          totalDisponible={productosOrdenados.length}
        />
      </section>

      {/* Tabla detalle */}
      <section id="detalle" className="scroll-mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Detalle ({(count ?? 0).toLocaleString("es-MX")} ventas)
          </h2>
          <span className="text-xs text-zinc-500">
            Página {page} de {totalPaginas}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Máquina</th>
                <th className="px-3 py-2 font-medium">Ubicación</th>
                <th className="px-3 py-2 font-medium">Tolva</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">g</th>
                <th className="px-3 py-2 text-right font-medium">Venta al público</th>
                <th className="px-3 py-2 text-right font-medium">Comisión Nayax</th>
                <th className="px-3 py-2 text-right font-medium">Venta bruta</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
                <th className="px-3 py-2 text-right font-medium">Utilidad</th>
                <th className="px-3 py-2 text-right font-medium">Margen</th>
                <th className="px-3 py-2 font-medium">Método</th>
                <th className="px-3 py-2 font-medium">Ticket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(ventas ?? []).map((v) => {
                const maq = Array.isArray(v.maquina) ? v.maquina[0] : v.maquina;
                const prod = Array.isArray(v.producto) ? v.producto[0] : v.producto;
                const tol = Array.isArray(v.tolva) ? v.tolva[0] : v.tolva;
                const ubi = Array.isArray(maq?.ubicacion)
                  ? maq?.ubicacion[0]
                  : maq?.ubicacion;
                const cli = Array.isArray(ubi?.cliente) ? ubi?.cliente[0] : ubi?.cliente;
                const costo =
                  Number(v.costo_polvo ?? 0) + Number(v.costo_vaso ?? 0);
                const util = Number(v.utilidad_bruta ?? 0);
                return (
                  <tr key={v.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 text-xs text-zinc-700">
                      {fmtCDMXFechaHora(v.fecha_transaccion)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-xs font-medium">
                        {maq?.alias ?? "—"}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-500">
                        #{maq?.serie}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{ubi?.nombre ?? "—"}</div>
                      <div className="text-[10px] text-zinc-500">
                        {cli?.nombre ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      #{tol?.numero ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {prod ? (
                        <>
                          <div className="text-xs">{prod.nombre}</div>
                          <div className="font-mono text-[10px] text-zinc-500">
                            {prod.sku}
                          </div>
                        </>
                      ) : (
                        // Venta de receta (máquina preparado) — el nombre de la
                        // bebida vive en notas con prefijo "Receta: ".
                        (() => {
                          const notas =
                            (v.notas as string | null) ?? "";
                          const m = notas.match(/^Receta:\s*(.+)$/);
                          const bebida = m ? m[1] : "—";
                          return (
                            <>
                              <div className="text-xs">{bebida}</div>
                              <div className="text-[10px] text-amber-700">
                                receta
                              </div>
                            </>
                          );
                        })()
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      {v.gramos_dispensados}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMxn(Number(v.precio_bruto))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-500">
                      {fmtMxn(Number(v.comision_nayax_estimada))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMxn(Number(v.precio_neto))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-500">
                      {fmtMxn(costo)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        util < 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {fmtMxn(util)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-500">
                      {v.margen_porcentaje != null ? `${v.margen_porcentaje}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{v.metodo_pago ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                      {v.ticket_id_nayax ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {(ventas ?? []).length === 0 && (
                <tr>
                  <td colSpan={14} className="px-3 py-8 text-center text-sm text-zinc-500">
                    Sin ventas en el período/filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación simple */}
        {totalPaginas > 1 && (
          <PaginacionLinks searchParams={searchParams} page={page} totalPaginas={totalPaginas} />
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
        ? "text-red-700"
        : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

function buildToggleHref(
  sp: SearchParams,
  paramName: "top_maquinas" | "top_productos",
  currentlyAll: boolean,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== paramName && k !== "page") params.set(k, String(v));
  }
  if (!currentlyAll) params.set(paramName, "all");
  return `/admin/ventas?${params.toString()}#detalle`;
}

function buildFilterHref(
  sp: SearchParams,
  paramName: "maquina" | "producto",
  value: string,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "page" && k !== "top_maquinas" && k !== "top_productos")
      params.set(k, String(v));
  }
  params.set(paramName, value);
  return `/admin/ventas?${params.toString()}#detalle`;
}

function TopTabla({
  titulo,
  rows,
  filterParam,
  searchParams,
  mostrarTodosHref,
  mostrarTodosLabel,
  totalDisponible,
}: {
  titulo: string;
  rows: {
    key: string;
    label: string;
    sublabel?: string;
    ingresos: number;
    ventas: number;
    utilidad: number;
    filterId: string;
  }[];
  filterParam: "maquina" | "producto";
  searchParams: SearchParams;
  mostrarTodosHref: string;
  mostrarTodosLabel: string;
  totalDisponible: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700">{titulo}</h3>
        {totalDisponible > 10 && (
          <a
            href={mostrarTodosHref}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            {mostrarTodosLabel}
          </a>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="py-1 font-medium">Concepto</th>
            <th className="py-1 text-right font-medium">Ventas</th>
            <th className="py-1 text-right font-medium">Venta bruta</th>
            <th className="py-1 text-right font-medium">Utilidad</th>
            <th className="py-1 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-zinc-50">
              <td className="py-1.5">
                <div className="text-xs font-medium">{r.label}</div>
                {r.sublabel && (
                  <div className="font-mono text-[10px] text-zinc-500">
                    {r.sublabel}
                  </div>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums text-xs">
                {r.ventas.toLocaleString("es-MX")}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {fmtMxn(r.ingresos)}
              </td>
              <td
                className={`py-1.5 text-right tabular-nums ${
                  r.utilidad < 0 ? "text-red-700" : "text-green-700"
                }`}
              >
                {fmtMxn(r.utilidad)}
              </td>
              <td className="py-1.5 text-right">
                {r.filterId ? (
                  <a
                    href={buildFilterHref(searchParams, filterParam, r.filterId)}
                    className="text-xs font-medium text-blue-700 hover:underline"
                    title={`Ver detalle de ${r.label}`}
                  >
                    Ver detalle →
                  </a>
                ) : (
                  <span
                    className="text-xs text-zinc-400"
                    title="Las ventas de receta no se pueden filtrar por producto"
                  >
                    —
                  </span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-xs text-zinc-500">
                Sin datos.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PaginacionLinks({
  searchParams,
  page,
  totalPaginas,
}: {
  searchParams: SearchParams;
  page: number;
  totalPaginas: number;
}) {
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== "page") params.set(k, String(v));
    }
    params.set("page", String(p));
    return `/admin/ventas?${params.toString()}`;
  };
  return (
    <div className="flex justify-center gap-2 pt-2">
      {page > 1 && (
        <a
          href={buildHref(page - 1)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs hover:bg-zinc-50"
        >
          ← Anterior
        </a>
      )}
      <span className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs text-zinc-700">
        {page} / {totalPaginas}
      </span>
      {page < totalPaginas && (
        <a
          href={buildHref(page + 1)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs hover:bg-zinc-50"
        >
          Siguiente →
        </a>
      )}
    </div>
  );
}
