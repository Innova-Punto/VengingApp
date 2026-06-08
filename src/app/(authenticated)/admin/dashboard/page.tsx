import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Coins,
  DollarSign,
  PackageMinus,
  Percent,
  Receipt,
  Scale,
  ShoppingBag,
  TrendingDown,
  Warehouse,
  Weight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { isoFechaCDMX, startOfNDaysAgoCDMX, startOfTodayCDMX } from "@/lib/datetime";
import { getIncidenciaTipoInfo } from "@/lib/incidencias-catalogo";
import { createClient } from "@/lib/supabase/server";

import {
  IncidenciasCategoriaChart,
  TopProductosChart,
  VentasPorDiaChart,
} from "./Charts";

export const metadata = { title: "Dashboard · MuscleUp" };

type SearchParams = { rango?: string };

const RANGOS: Record<string, { label: string; dias: number }> = {
  "7d": { label: "Últimos 7 días", dias: 7 },
  "30d": { label: "Últimos 30 días", dias: 30 },
  "90d": { label: "Últimos 90 días", dias: 90 },
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const rangoKey = searchParams.rango ?? "30d";
  const rango = RANGOS[rangoKey] ?? RANGOS["30d"];
  // Inicio del rango y de "hoy" en hora CDMX (no UTC del servidor).
  const desde = startOfNDaysAgoCDMX(rango.dias).toISOString();
  const hoyInicioIso = startOfTodayCDMX().toISOString();

  // Mes y año en hora CDMX (no UTC del servidor).
  const [anioCDMX, mesCDMX] = isoFechaCDMX(new Date()).split("-");
  const mes = Number(mesCDMX);
  const anio = Number(anioCDMX);

  // 1. KPI rango + hoy
  const [
    { data: ventasRango },
    { data: ventasHoy },
    { data: cierreActual },
    { data: maquinasActivas },
    { data: incidenciasAbiertas },
    { data: devPendientes },
    { data: asignacionesHoy },
  ] = await Promise.all([
    supabase
      .from("ventas_maquina")
      .select(
        `precio_neto, utilidad_bruta, gramos_dispensados, producto_id, maquina_id, fecha_transaccion,
         producto:productos(sku, nombre),
         maquina:maquinas(serie, alias)`,
      )
      .gte("fecha_transaccion", desde)
      .range(0, 99999),
    supabase
      .from("ventas_maquina")
      .select("precio_neto, utilidad_bruta")
      .gte("fecha_transaccion", hoyInicioIso)
      .range(0, 99999),
    supabase
      .from("cierres_mensuales")
      .select("id, estado, conteo_almacen_completado, periodo_mes, periodo_anio")
      .in("estado", ["abierto", "en_proceso"])
      .order("periodo_anio", { ascending: false })
      .order("periodo_mes", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("maquinas")
      .select("id", { count: "exact", head: false })
      .eq("activo", true)
      .neq("estado", "baja"),
    supabase
      .from("incidencias")
      .select("id, severidad", { count: "exact", head: false })
      .in("estado", ["abierta", "en_revision"]),
    supabase
      .from("devoluciones_almacen")
      .select("id, cantidad_calculada", { count: "exact", head: false })
      .eq("estado", "pendiente_devolucion"),
    supabase
      .from("asignaciones_diarias")
      .select("id, estado")
      .eq("fecha", isoFechaCDMX(new Date())),
  ]);

  const ventasArr = ventasRango ?? [];
  const totalVentas = ventasArr.length;
  const ingresosRango = ventasArr.reduce(
    (s, v) => s + Number(v.precio_neto ?? 0),
    0,
  );
  const utilidadRango = ventasArr.reduce(
    (s, v) => s + Number(v.utilidad_bruta ?? 0),
    0,
  );
  const gramosRango = ventasArr.reduce(
    (s, v) => s + (v.gramos_dispensados ?? 0),
    0,
  );
  const margenPromedio =
    ingresosRango > 0
      ? (utilidadRango / ingresosRango) * 100
      : 0;
  const ticketPromedio = totalVentas > 0 ? ingresosRango / totalVentas : 0;

  const ingresosHoy = (ventasHoy ?? []).reduce(
    (s, v) => s + Number(v.precio_neto ?? 0),
    0,
  );
  const utilidadHoy = (ventasHoy ?? []).reduce(
    (s, v) => s + Number(v.utilidad_bruta ?? 0),
    0,
  );

  // 2. Top productos
  const porProducto = new Map<
    string,
    { nombre: string; sku: string; ventas: number; ingresos: number; utilidad: number }
  >();
  for (const v of ventasArr) {
    if (!v.producto_id) continue;
    const prod = Array.isArray(v.producto) ? v.producto[0] : v.producto;
    const acc = porProducto.get(v.producto_id) ?? {
      nombre: prod?.nombre ?? "—",
      sku: prod?.sku ?? "—",
      ventas: 0,
      ingresos: 0,
      utilidad: 0,
    };
    acc.ventas += 1;
    acc.ingresos += Number(v.precio_neto ?? 0);
    acc.utilidad += Number(v.utilidad_bruta ?? 0);
    porProducto.set(v.producto_id, acc);
  }
  const topProductos = Array.from(porProducto.values())
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 10);

  // 3. Top máquinas
  const porMaquina = new Map<
    string,
    { serie: string; alias: string; ventas: number; ingresos: number; utilidad: number }
  >();
  for (const v of ventasArr) {
    const maq = Array.isArray(v.maquina) ? v.maquina[0] : v.maquina;
    const acc = porMaquina.get(v.maquina_id) ?? {
      serie: maq?.serie ?? "—",
      alias: maq?.alias ?? "",
      ventas: 0,
      ingresos: 0,
      utilidad: 0,
    };
    acc.ventas += 1;
    acc.ingresos += Number(v.precio_neto ?? 0);
    acc.utilidad += Number(v.utilidad_bruta ?? 0);
    porMaquina.set(v.maquina_id, acc);
  }
  const topMaquinas = Array.from(porMaquina.values())
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 10);

  // Series para gráficos
  // a) Ingresos / utilidad por día (rango) — agrupado por fecha CDMX
  const porDia = new Map<string, { ingresos: number; utilidad: number }>();
  for (let i = rango.dias - 1; i >= 0; i--) {
    const d = isoFechaCDMX(new Date(Date.now() - i * 86400000));
    porDia.set(d, { ingresos: 0, utilidad: 0 });
  }
  for (const v of ventasArr) {
    const d = isoFechaCDMX(v.fecha_transaccion);
    const acc = porDia.get(d) ?? { ingresos: 0, utilidad: 0 };
    acc.ingresos += Number(v.precio_neto ?? 0);
    acc.utilidad += Number(v.utilidad_bruta ?? 0);
    porDia.set(d, acc);
  }
  const ventasPorDia = Array.from(porDia.entries()).map(([fecha, v]) => ({
    fecha,
    ingresos: Math.round(v.ingresos * 100) / 100,
    utilidad: Math.round(v.utilidad * 100) / 100,
  }));

  // b) Top productos para chart (reusa topProductos)
  const topProductosChart = topProductos.map((p) => ({
    nombre: p.nombre.length > 22 ? p.nombre.slice(0, 22) + "…" : p.nombre,
    utilidad: Math.round(p.utilidad * 100) / 100,
  }));

  // c) Incidencias por categoría (últimos 90d para tener volumen)
  const { data: incTodas } = await supabase
    .from("incidencias")
    .select("tipo")
    .gte("fecha_apertura", new Date(Date.now() - 90 * 86400000).toISOString());
  const porCategoria = new Map<string, number>();
  for (const i of incTodas ?? []) {
    const info = getIncidenciaTipoInfo(i.tipo);
    const cat = info?.categoria ?? "otro";
    porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + 1);
  }
  const incidenciasCategoria = Array.from(porCategoria.entries())
    .map(([categoria, count]) => ({ categoria, count }))
    .sort((a, b) => b.count - a.count);

  // 4. Mermas del mes (pesajes + incidencias autorizadas) — desde día 1 CDMX
  const inicioMesStr = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const inicioMes = new Date(`${inicioMesStr}T00:00:00-06:00`).toISOString();
  const [{ data: mermaPesaje }, { data: mermaIncid }] = await Promise.all([
    supabase
      .from("movimientos_inventario")
      .select("valor_movimiento, gramos")
      .in("tipo", ["ajuste_conteo_maquina", "ajuste_conteo_almacen"])
      .gte("fecha", inicioMes),
    supabase
      .from("movimientos_inventario")
      .select("valor_movimiento, cantidad_cartuchos, gramos")
      .in("tipo", ["merma_ruta", "merma_encartuchado"])
      .gte("fecha", inicioMes),
  ]);

  let ajusteValorMes = 0;
  for (const m of mermaPesaje ?? []) ajusteValorMes += Number(m.valor_movimiento ?? 0);
  let mermaValorMes = 0;
  let mermaCartuchosMes = 0;
  for (const m of mermaIncid ?? []) {
    mermaValorMes += Number(m.valor_movimiento ?? 0);
    mermaCartuchosMes += Math.abs(m.cantidad_cartuchos ?? 0);
  }

  // 5. Operativo
  const totalMaquinas = (maquinasActivas ?? []).length;

  // ¿Cuántas máquinas activas han sido pesadas en el cierre actual?
  let maquinasPesadasMes = 0;
  if (cierreActual) {
    const { data: pesadas } = await supabase
      .from("pesajes_maquina")
      .select("maquina_id")
      .eq("cierre_id", cierreActual.id);
    maquinasPesadasMes = new Set((pesadas ?? []).map((p) => p.maquina_id)).size;
  }

  const incidenciasAltas =
    (incidenciasAbiertas ?? []).filter((i) => i.severidad === "alta").length || 0;
  const totalIncidenciasAbiertas = (incidenciasAbiertas ?? []).length;

  const devCartuchosPendientes = (devPendientes ?? []).reduce(
    (s, d) => s + (d.cantidad_calculada ?? 0),
    0,
  );

  const asignacionesHoyArr = asignacionesHoy ?? [];
  const enJornada = asignacionesHoyArr.filter(
    (a) => a.estado === "en_jornada",
  ).length;
  const completadasHoy = asignacionesHoyArr.filter(
    (a) => a.estado === "completada",
  ).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-600">
            Vista ejecutiva del negocio. Filtros por rango.
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <select
            name="rango"
            defaultValue={rangoKey}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            {Object.entries(RANGOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Aplicar
          </button>
        </form>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Hoy
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Ventas hoy"
            value={String((ventasHoy ?? []).length)}
            icon={Receipt}
          />
          <Stat
            label="Ingresos hoy"
            value={fmt(ingresosHoy)}
            icon={DollarSign}
          />
          <Stat
            label="Utilidad hoy"
            value={fmt(utilidadHoy)}
            tone={utilidadHoy >= 0 ? "green" : "red"}
            icon={Coins}
          />
          <Stat
            label="Asignaciones de hoy"
            value={`${completadasHoy} / ${asignacionesHoyArr.length}`}
            hint={`${enJornada} en curso`}
            icon={ClipboardList}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          {rango.label}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Ventas" value={totalVentas.toLocaleString("es-MX")} icon={Receipt} />
          <Stat label="Ingresos netos" value={fmt(ingresosRango)} icon={DollarSign} />
          <Stat
            label="Utilidad"
            value={fmt(utilidadRango)}
            tone={utilidadRango >= 0 ? "green" : "red"}
            icon={Coins}
          />
          <Stat
            label="Margen promedio"
            value={`${margenPromedio.toFixed(1)}%`}
            tone={margenPromedio >= 0 ? "green" : "red"}
            icon={Percent}
          />
          <Stat
            label="Ticket promedio"
            value={fmt(ticketPromedio)}
            hint={`${(gramosRango / 1000).toFixed(1)} kg dispensados`}
            icon={ShoppingBag}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Estado operativo
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Máquinas pesadas (mes)"
            value={`${maquinasPesadasMes} / ${totalMaquinas}`}
            tone={
              cierreActual && maquinasPesadasMes < totalMaquinas
                ? "amber"
                : "zinc"
            }
            hint={
              cierreActual
                ? `Cierre ${String(cierreActual.periodo_mes).padStart(2, "0")}/${cierreActual.periodo_anio} ${cierreActual.estado}`
                : "Sin cierre abierto"
            }
            icon={Scale}
          />
          <Stat
            label="Incidencias abiertas"
            value={String(totalIncidenciasAbiertas)}
            tone={incidenciasAltas > 0 ? "red" : totalIncidenciasAbiertas > 0 ? "amber" : "zinc"}
            hint={incidenciasAltas > 0 ? `${incidenciasAltas} de severidad alta` : undefined}
            icon={AlertTriangle}
          />
          <Stat
            label="Devoluciones pendientes"
            value={String((devPendientes ?? []).length)}
            tone={(devPendientes ?? []).length > 0 ? "amber" : "zinc"}
            hint={`${devCartuchosPendientes} cartuchos`}
            icon={PackageMinus}
          />
          <Stat
            label="Conteo almacén"
            value={cierreActual?.conteo_almacen_completado ? "Completado" : "Pendiente"}
            tone={cierreActual?.conteo_almacen_completado ? "green" : "amber"}
            icon={cierreActual?.conteo_almacen_completado ? CheckCircle2 : Warehouse}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Mermas del mes (movimientos)
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat
            label="Ajustes por conteo (valor neto)"
            value={fmt(ajusteValorMes)}
            tone={ajusteValorMes < 0 ? "red" : ajusteValorMes > 0 ? "amber" : "zinc"}
            hint="Diferencias capturadas en pesajes y conteos de almacén"
            icon={Scale}
          />
          <Stat
            label="Mermas autorizadas (valor)"
            value={fmt(mermaValorMes)}
            tone={mermaValorMes < 0 ? "red" : "zinc"}
            hint="Por incidencias con merma autorizada"
            icon={TrendingDown}
          />
          <Stat
            label="Cartuchos mermados"
            value={String(mermaCartuchosMes)}
            icon={Weight}
            tone={mermaCartuchosMes > 0 ? "red" : "zinc"}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold tracking-tight">
            Ingresos y utilidad por día · {rango.label}
          </h2>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <VentasPorDiaChart data={ventasPorDia} />
            <div className="mt-3 flex items-center gap-4 text-xs text-zinc-600">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-brand" />
                Ingresos netos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-brand-accent" />
                Utilidad
              </span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-tight">
            Top productos por utilidad
          </h2>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <TopProductosChart data={topProductosChart} />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-tight">
            Incidencias por categoría (90 días)
          </h2>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <IncidenciasCategoriaChart data={incidenciasCategoria} />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-tight">
            Top productos · {rango.label}
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Vtas.</th>
                  <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                  <th className="px-3 py-2 text-right font-medium">Utilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {topProductos.map((p, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1">
                      <div className="font-medium">{p.nombre}</div>
                      <div className="font-mono text-[10px] text-zinc-500">
                        {p.sku}
                      </div>
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-zinc-600">
                      {p.ventas}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {fmt(p.ingresos)}
                    </td>
                    <td
                      className={`px-3 py-1 text-right tabular-nums ${
                        p.utilidad < 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {fmt(p.utilidad)}
                    </td>
                  </tr>
                ))}
                {topProductos.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-6 text-center text-sm text-zinc-500"
                    >
                      Sin ventas en el rango.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-tight">
            Top máquinas · {rango.label}
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Máquina</th>
                  <th className="px-3 py-2 text-right font-medium">Vtas.</th>
                  <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                  <th className="px-3 py-2 text-right font-medium">Utilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {topMaquinas.map((m, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1">
                      <div className="font-mono text-xs font-medium">
                        {m.serie}
                      </div>
                      {m.alias && (
                        <div className="text-xs text-zinc-500">{m.alias}</div>
                      )}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-zinc-600">
                      {m.ventas}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {fmt(m.ingresos)}
                    </td>
                    <td
                      className={`px-3 py-1 text-right tabular-nums ${
                        m.utilidad < 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {fmt(m.utilidad)}
                    </td>
                  </tr>
                ))}
                {topMaquinas.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-6 text-center text-sm text-zinc-500"
                    >
                      Sin ventas en el rango.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
        <p className="mb-2 font-medium text-zinc-900">Atajos</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/incidencias"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-100"
          >
            Incidencias →
          </Link>
          <Link
            href="/almacen/devoluciones"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-100"
          >
            Devoluciones →
          </Link>
          <Link
            href="/admin/cierres"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-100"
          >
            Cierre del mes →
          </Link>
          <Link
            href="/admin/jornadas"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-100"
          >
            Auditoría jornadas →
          </Link>
          <Link
            href="/admin/nayax"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-100"
          >
            Nayax →
          </Link>
        </div>
      </section>
    </div>
  );
}

function fmt(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Stat({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "green" | "red" | "amber" | "zinc";
  icon?: LucideIcon;
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-zinc-900";
  const iconBg =
    tone === "green"
      ? "bg-green-50 text-green-600"
      : tone === "red"
        ? "bg-red-50 text-red-600"
        : tone === "amber"
          ? "bg-amber-50 text-amber-600"
          : "bg-zinc-50 text-zinc-500";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 transition hover:border-zinc-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>
            {value}
          </div>
          {hint && <div className="mt-1 text-[10px] text-zinc-500">{hint}</div>}
        </div>
        {Icon && (
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${iconBg}`}>
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
        )}
      </div>
    </div>
  );
}
