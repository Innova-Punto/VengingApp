import { requireRole } from "@/lib/auth";
import {
  fmtCDMXFechaHora,
  isoFechaCDMX,
  startOfNDaysAgoCDMX,
  startOfTodayCDMX,
} from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import VentasFilters from "./VentasFilters";
import { IngresosPorDiaChart, VentasPorClienteChart } from "./Charts";

export const metadata = { title: "Ventas · MuscleUp" };

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

  // KPIs y agregaciones requieren TODAS las ventas del rango (no paginadas).
  let qAgg = supabase
    .from("ventas_maquina")
    .select(
      `precio_bruto, comision_nayax_estimada, precio_neto, utilidad_bruta,
       costo_polvo, costo_vaso,
       margen_porcentaje, gramos_dispensados,
       fecha_transaccion, metodo_pago, maquina_id, producto_id, cliente_id,
       notas,
       cliente:clientes(id, nombre),
       maquina:maquinas(serie, alias),
       producto:productos(sku, nombre)`,
    )
    .gte("fecha_transaccion", desdeISO)
    .lte("fecha_transaccion", hastaISO);

  if (searchParams.cliente) qAgg = qAgg.eq("cliente_id", searchParams.cliente);
  if (searchParams.maquina) qAgg = qAgg.eq("maquina_id", searchParams.maquina);
  if (searchParams.producto) qAgg = qAgg.eq("producto_id", searchParams.producto);
  if (searchParams.metodo) qAgg = qAgg.eq("metodo_pago", searchParams.metodo);
  if (utilidadFilter === "negativas") qAgg = qAgg.lt("utilidad_bruta", 0);

  // Sin range Supabase limita a 1000 → KPIs y agregados quedan truncados.
  // Subimos a 100k para que entren todas las ventas del rango.
  const { data: allVentas } = await qAgg.range(0, 99999);
  const aggFiltradas = allVentas ?? [];

  // KPIs
  const nVentas = aggFiltradas.length;
  const ventaPublico = aggFiltradas.reduce((s, v) => s + Number(v.precio_bruto ?? 0), 0);
  const comisionNayax = aggFiltradas.reduce(
    (s, v) => s + Number(v.comision_nayax_estimada ?? 0),
    0,
  );
  const ventaBruta = aggFiltradas.reduce((s, v) => s + Number(v.precio_neto ?? 0), 0);
  const costoPolvo = aggFiltradas.reduce((s, v) => s + Number(v.costo_polvo ?? 0), 0);
  const costoVaso = aggFiltradas.reduce((s, v) => s + Number(v.costo_vaso ?? 0), 0);
  const utilidad = aggFiltradas.reduce((s, v) => s + Number(v.utilidad_bruta ?? 0), 0);
  const gramos = aggFiltradas.reduce((s, v) => s + (v.gramos_dispensados ?? 0), 0);
  const margenProm =
    nVentas > 0
      ? aggFiltradas.reduce((s, v) => s + Number(v.margen_porcentaje ?? 0), 0) / nVentas
      : 0;
  const ticketProm = nVentas > 0 ? ventaBruta / nVentas : 0;

  // Ingresos por día (solo venta bruta)
  const porDia = new Map<string, { ingresos: number }>();
  for (const v of aggFiltradas) {
    const dia = isoFechaCDMX(v.fecha_transaccion);
    const cur = porDia.get(dia) ?? { ingresos: 0 };
    cur.ingresos += Number(v.precio_neto ?? 0);
    porDia.set(dia, cur);
  }
  const dataPorDia = Array.from(porDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, vals]) => ({ fecha, ...vals }));

  // Ventas por cliente
  const porCliente = new Map<string, number>();
  for (const v of aggFiltradas) {
    const cli = Array.isArray(v.cliente) ? v.cliente[0] : v.cliente;
    const nombre = cli?.nombre ?? "(sin cliente)";
    porCliente.set(nombre, (porCliente.get(nombre) ?? 0) + Number(v.precio_neto ?? 0));
  }
  const dataPorCliente = Array.from(porCliente.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cliente, valor]) => ({ cliente, valor }));

  // Top máquinas por ingreso
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
  const porMaquina = new Map<string, TopRow>();
  for (const v of aggFiltradas) {
    const maq = Array.isArray(v.maquina) ? v.maquina[0] : v.maquina;
    if (!maq) continue;
    const key = maq.serie ?? v.maquina_id;
    const cur =
      porMaquina.get(key) ??
      {
        key,
        label: maq.alias ?? maq.serie,
        sublabel: `#${maq.serie}`,
        ingresos: 0,
        ventas: 0,
        utilidad: 0,
        filterId: v.maquina_id,
      };
    cur.ingresos += Number(v.precio_neto ?? 0);
    cur.utilidad += Number(v.utilidad_bruta ?? 0);
    cur.ventas += 1;
    porMaquina.set(key, cur);
  }
  const maquinasOrdenadas = Array.from(porMaquina.values()).sort(
    (a, b) => b.ingresos - a.ingresos,
  );
  const showAllMaquinas = searchParams.top_maquinas === "all";
  const maquinasParaMostrar = showAllMaquinas
    ? maquinasOrdenadas
    : maquinasOrdenadas.slice(0, 10);

  // Top productos por ingreso
  const porProducto = new Map<string, TopRow>();
  for (const v of aggFiltradas) {
    const prod = Array.isArray(v.producto) ? v.producto[0] : v.producto;

    let key: string;
    let label: string;
    let sublabel: string;
    let filterId: string;

    if (prod && v.producto_id) {
      // Venta de producto directo (polvo_directo)
      key = prod.sku;
      label = prod.nombre;
      sublabel = prod.sku;
      filterId = v.producto_id;
    } else {
      // Venta de receta (máquina preparado) — agrupar por nombre de bebida
      const notas = (v.notas as string | null) ?? "";
      const m = notas.match(/^Receta:\s*(.+)$/);
      if (!m) continue; // sin producto ni receta identificable
      key = `receta:${m[1]}`;
      label = m[1];
      sublabel = "receta";
      filterId = ""; // no se puede filtrar por producto_id, queda sin link
    }

    const cur =
      porProducto.get(key) ??
      { key, label, sublabel, ingresos: 0, ventas: 0, utilidad: 0, filterId };
    cur.ingresos += Number(v.precio_neto ?? 0);
    cur.utilidad += Number(v.utilidad_bruta ?? 0);
    cur.ventas += 1;
    porProducto.set(key, cur);
  }
  const productosOrdenados = Array.from(porProducto.values()).sort(
    (a, b) => b.ingresos - a.ingresos,
  );
  const showAllProductos = searchParams.top_productos === "all";
  const productosParaMostrar = showAllProductos
    ? productosOrdenados
    : productosOrdenados.slice(0, 10);

  const totalPaginas = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Métodos disponibles (para el filtro)
  const metodosDisponibles = Array.from(
    new Set((allVentas ?? []).map((v) => v.metodo_pago).filter(Boolean) as string[]),
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
