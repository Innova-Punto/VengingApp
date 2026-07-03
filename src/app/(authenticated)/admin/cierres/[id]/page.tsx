import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import {
  construirSnapshotCierre,
  type SnapshotCierre,
} from "@/lib/cierre-reporte/builder";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import { cerrarCierre } from "../actions";
import PesajeItemEditor from "./PesajeItemEditor";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const ESTADO_BADGE: Record<string, string> = {
  abierto: "bg-blue-100 text-blue-700",
  en_proceso: "bg-amber-100 text-amber-700",
  cerrado: "bg-green-100 text-green-700",
};

export default async function CierreDetallePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const { data: cierre } = await supabase
    .from("cierres_mensuales")
    .select(
      `id, periodo_mes, periodo_anio, estado,
       fecha_inicio_cierre, fecha_cierre, maquinas_pesadas,
       total_maquinas_periodo, conteo_almacen_completado, notas`,
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!cierre) notFound();

  // Clientes no-intercompany para reportes de cierre por cliente
  const { data: clientesReporte } = await supabase
    .from("clientes")
    .select("id, nombre")
    .eq("activo", true)
    .eq("es_intercompany", false)
    .order("nombre");

  // Snapshot financiero por cliente (mismo cálculo que el Excel por-cliente):
  // inventario al corte vía capital_trabajo + ventas/ajustes filtrados por
  // los productos exclusivos del cliente. Se calculan en paralelo.
  const snapsCliente = await Promise.all(
    (clientesReporte ?? []).map(async (c) => {
      const [snap, erRes] = await Promise.all([
        construirSnapshotCierre(supabase, params.id, c.id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("agregar_ventas", {
          p_desde: cierre.fecha_inicio_cierre ?? "1900-01-01",
          p_hasta: cierre.fecha_cierre ?? new Date().toISOString(),
          p_cliente_id: c.id,
          p_maquina_id: null,
          p_producto_id: null,
          p_metodo: null,
          p_solo_negativas: false,
        }),
      ]);
      return { cliente: c, snap, er: erRes?.data?.kpis ?? null };
    }),
  );

  // Inventario inicial/final + consumo por cliente, desde el snapshot por
  // producto (cada producto pertenece a un cliente vía cliente_exclusivo_id).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snapProdRows } = await (supabase as any)
    .from("cierre_snapshot_producto")
    .select(
      `momento, aproximado, producto_id,
       alm_granel_valor, alm_cartuchos_valor, alm_vasos_valor,
       maq_polvo_valor, maq_vasos_valor,
       producto:productos(sku, nombre, cliente_exclusivo_id)`,
    )
    .eq("cierre_id", params.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: enviadoRows } = await (supabase as any)
    .from("movimientos_inventario")
    .select("valor_movimiento, producto:productos(cliente_exclusivo_id)")
    .eq("tipo", "llenado_entrada_tolva")
    .gte("fecha", cierre.fecha_inicio_cierre ?? "1900-01-01")
    .lt("fecha", cierre.fecha_cierre ?? new Date().toISOString())
    .range(0, 200000);

  type ResumenCli = {
    inicio: number;
    fin: number;
    maqIni: number;
    maqFin: number;
    enviado: number;
    aprox: boolean;
  };
  const resumenPorCliente = new Map<string, ResumenCli>();
  const getRes = (cid: string): ResumenCli => {
    let r = resumenPorCliente.get(cid);
    if (!r) {
      r = { inicio: 0, fin: 0, maqIni: 0, maqFin: 0, enviado: 0, aprox: false };
      resumenPorCliente.set(cid, r);
    }
    return r;
  };
  // Desglose por SKU dentro de cada cliente: producto_id → {sku, nombre, inicio, fin}
  type SkuRow = { sku: string; nombre: string; inicio: number; fin: number };
  const skusPorCliente = new Map<string, Map<string, SkuRow>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (snapProdRows ?? []) as any[]) {
    const prod = Array.isArray(row.producto) ? row.producto[0] : row.producto;
    const cid = prod?.cliente_exclusivo_id;
    if (!cid) continue;
    const alm =
      Number(row.alm_granel_valor ?? 0) +
      Number(row.alm_cartuchos_valor ?? 0) +
      Number(row.alm_vasos_valor ?? 0);
    const maq = Number(row.maq_polvo_valor ?? 0) + Number(row.maq_vasos_valor ?? 0);
    const total = alm + maq;
    const r = getRes(cid);
    if (row.momento === "inicio") {
      r.inicio += total;
      r.maqIni += maq;
      if (row.aproximado) r.aprox = true;
    } else {
      r.fin += total;
      r.maqFin += maq;
    }
    // por SKU
    let m = skusPorCliente.get(cid);
    if (!m) {
      m = new Map<string, SkuRow>();
      skusPorCliente.set(cid, m);
    }
    let sr = m.get(row.producto_id);
    if (!sr) {
      sr = {
        sku: prod?.sku ?? "—",
        nombre: prod?.nombre ?? "—",
        inicio: 0,
        fin: 0,
      };
      m.set(row.producto_id, sr);
    }
    if (row.momento === "inicio") sr.inicio += total;
    else sr.fin += total;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (enviadoRows ?? []) as any[]) {
    const prod = Array.isArray(row.producto) ? row.producto[0] : row.producto;
    const cid = prod?.cliente_exclusivo_id;
    if (!cid) continue;
    getRes(cid).enviado += Math.abs(Number(row.valor_movimiento ?? 0));
  }

  const { data: pesajes } = await supabase
    .from("pesajes_maquina")
    .select(
      `id, fecha,
       vasos_teoricos, vasos_medidos, vasos_valor_diferencia,
       maquina:maquinas(serie, alias, vaso_producto:productos!maquinas_vaso_producto_id_fkey(sku, nombre)),
       operador:profiles!pesajes_maquina_operador_id_fkey(full_name),
       items:pesaje_tolva_items(
         id, gramos_medidos, gramos_teoricos, diferencia_gramos,
         diferencia_porcentaje, valor_diferencia, alerta_generada,
         tolva:tolvas(numero, producto:productos(sku, nombre))
       )`,
    )
    .eq("cierre_id", cierre.id)
    .order("fecha", { ascending: false });

  // Avance de pesaje: máquinas activas vs máquinas ya pesadas en este cierre
  // (mismo criterio que usa cerrar_cierre_mensual para validar el 100%).
  const [{ data: maquinasActivas }, { data: pesadasRows }] = await Promise.all([
    supabase
      .from("maquinas")
      .select("id, serie, alias")
      .eq("activo", true)
      .neq("estado", "baja")
      .order("serie"),
    supabase
      .from("pesajes_maquina")
      .select("maquina_id")
      .eq("cierre_id", cierre.id),
  ]);
  const pesadasSet = new Set((pesadasRows ?? []).map((r) => r.maquina_id));
  const maqActivas = maquinasActivas ?? [];
  const totalMaquinas = maqActivas.length;
  const maquinasPesadasCount = maqActivas.filter((m) =>
    pesadasSet.has(m.id),
  ).length;
  const maquinasPendientes = maqActivas.filter((m) => !pesadasSet.has(m.id));

  // Reporte financiero
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reporteRaw } = await (supabase as any)
    .from("vista_reporte_cierre")
    .select("*")
    .eq("cierre_id", cierre.id)
    .maybeSingle();
  const reporte = reporteRaw as
    | {
        gramos_almacen_inicio: number | null;
        valor_almacen_inicio: number | null;
        gramos_maquinas_inicio: number | null;
        valor_maquinas_inicio: number | null;
        valor_total_inicio: number;
        gramos_almacen_fin: number | null;
        valor_almacen_fin: number | null;
        gramos_maquinas_fin: number | null;
        valor_maquinas_fin: number | null;
        valor_total_fin: number;
        gramos_enviados_maquinas: number;
        valor_enviado_maquinas: number;
        gramos_devueltos: number;
        valor_devuelto: number;
        gramos_merma: number;
        valor_merma: number;
        gramos_ajuste_pesaje: number;
        valor_ajuste_pesaje: number;
        gramos_pesaje_faltante: number;
        valor_pesaje_faltante: number;
        gramos_pesaje_sobrante: number;
        valor_pesaje_sobrante: number;
        gramos_ajuste_almacen: number;
        valor_ajuste_almacen: number;
        gramos_venta_nayax: number;
        valor_venta_nayax: number;
        num_ventas_nayax: number;
        gramos_consumo_calculado: number;
        valor_consumo_calculado: number;
      }
    | null;

  // Estado de resultados del periodo (ventas del cierre, agregadas en SQL)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: erData } = await (supabase as any).rpc("agregar_ventas", {
    p_desde: cierre.fecha_inicio_cierre ?? "1900-01-01",
    p_hasta: cierre.fecha_cierre ?? new Date().toISOString(),
    p_cliente_id: null,
    p_maquina_id: null,
    p_producto_id: null,
    p_metodo: null,
    p_solo_negativas: false,
  });
  const erk = (erData?.kpis ?? {}) as {
    venta_publico?: number;
    iva?: number;
    ingreso_sin_iva?: number;
    comision_nayax?: number;
    costo_polvo?: number;
    costo_vaso?: number;
    utilidad?: number;
    margen_prom?: number;
    n_ventas?: number;
  };

  // Stats agregados + resumen consolidado de pesaje por producto
  let totalDiferenciaG = 0;
  let totalValorDiferencia = 0;
  let totalAlertas = 0;
  let totalItems = 0;
  const pesajePorProducto = new Map<
    string,
    {
      sku: string;
      nombre: string;
      teorico: number;
      medido: number;
      dif: number;
      valor: number;
      esVaso: boolean;
    }
  >();
  for (const p of pesajes ?? []) {
    const items = Array.isArray(p.items) ? p.items : [];
    for (const it of items) {
      totalDiferenciaG += it.diferencia_gramos ?? 0;
      totalValorDiferencia += Number(it.valor_diferencia ?? 0);
      if (it.alerta_generada) totalAlertas += 1;
      totalItems += 1;

      const t = Array.isArray(it.tolva) ? it.tolva[0] : it.tolva;
      const prod = t?.producto
        ? Array.isArray(t.producto)
          ? t.producto[0]
          : t.producto
        : null;
      const key = prod?.sku ?? prod?.nombre ?? "—";
      const cur =
        pesajePorProducto.get(key) ?? {
          sku: prod?.sku ?? "—",
          nombre: prod?.nombre ?? "—",
          teorico: 0,
          medido: 0,
          dif: 0,
          valor: 0,
          esVaso: false,
        };
      cur.teorico += it.gramos_teoricos ?? 0;
      cur.medido += it.gramos_medidos ?? 0;
      cur.dif += it.diferencia_gramos ?? 0;
      cur.valor += Number(it.valor_diferencia ?? 0);
      pesajePorProducto.set(key, cur);
    }

    // Conteo de vasos (mismo contexto que pesaje, pero en unidades)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pv = p as any;
    if (pv.vasos_teoricos != null || pv.vasos_medidos != null) {
      const maq = Array.isArray(p.maquina) ? p.maquina[0] : p.maquina;
      const vp = maq?.vaso_producto
        ? Array.isArray(maq.vaso_producto)
          ? maq.vaso_producto[0]
          : maq.vaso_producto
        : null;
      const key = "vaso:" + (vp?.sku ?? vp?.nombre ?? "—");
      const teo = Number(pv.vasos_teoricos ?? 0);
      const med = Number(pv.vasos_medidos ?? 0);
      const cur =
        pesajePorProducto.get(key) ?? {
          sku: vp?.sku ?? "—",
          nombre: vp?.nombre ?? "Vaso",
          teorico: 0,
          medido: 0,
          dif: 0,
          valor: 0,
          esVaso: true,
        };
      cur.teorico += teo;
      cur.medido += med;
      cur.dif += med - teo;
      cur.valor += Number(pv.vasos_valor_diferencia ?? 0);
      totalValorDiferencia += Number(pv.vasos_valor_diferencia ?? 0);
      pesajePorProducto.set(key, cur);
    }
  }
  // Ordenado por mayor faltante en valor (más negativo primero)
  const resumenPesaje = Array.from(pesajePorProducto.values()).sort(
    (a, b) => a.valor - b.valor,
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/cierres"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Cierres
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {MESES[cierre.periodo_mes - 1]} {cierre.periodo_anio}
          </h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              ESTADO_BADGE[cierre.estado] ?? "bg-zinc-100"
            }`}
          >
            {cierre.estado.replace(/_/g, " ")}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <a
              href={`/admin/cierres/${cierre.id}/reporte`}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              download
            >
              📥 Reporte global
            </a>
            {(clientesReporte ?? []).map((c) => (
              <a
                key={c.id}
                href={`/admin/cierres/${cierre.id}/reporte?cliente=${c.id}`}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                download
              >
                📥 {c.nombre}
              </a>
            ))}
          </div>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          Abierto:{" "}
          {cierre.fecha_inicio_cierre
            ? fmtCDMX(cierre.fecha_inicio_cierre, { day: "2-digit", month: "short", year: "numeric" })
            : "—"}
          {cierre.fecha_cierre && (
            <>
              {" · "}Cerrado:{" "}
              {fmtCDMX(cierre.fecha_cierre, { day: "2-digit", month: "short", year: "numeric" })}
            </>
          )}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat
          label="Máquinas pesadas"
          value={`${maquinasPesadasCount}/${totalMaquinas}`}
          hint={
            maquinasPendientes.length > 0
              ? `faltan ${maquinasPendientes.length}`
              : "todas ✓"
          }
          tone={maquinasPendientes.length > 0 ? "amber" : "zinc"}
        />
        <Stat
          label="Tolvas pesadas"
          value={String(totalItems)}
          hint={`${(pesajes ?? []).length} pesajes`}
        />
        <Stat
          label="Diferencia total"
          value={`${totalDiferenciaG.toLocaleString("es-MX")}g`}
          tone={totalDiferenciaG < 0 ? "red" : totalDiferenciaG > 0 ? "amber" : "zinc"}
        />
        <Stat
          label="Valor diferencia"
          value={`$${totalValorDiferencia.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          tone={totalValorDiferencia < 0 ? "red" : totalValorDiferencia > 0 ? "amber" : "zinc"}
        />
        <Stat
          label="Alertas (≥5%)"
          value={String(totalAlertas)}
          tone={totalAlertas > 0 ? "red" : "zinc"}
        />
      </section>

      {cierre.estado !== "cerrado" && maquinasPendientes.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Faltan {maquinasPendientes.length} máquina
            {maquinasPendientes.length === 1 ? "" : "s"} por pesar (
            {maquinasPesadasCount}/{totalMaquinas})
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {maquinasPendientes.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200"
              >
                <span className="font-mono font-medium">{m.serie}</span>
                {m.alias ? <span className="text-amber-600">· {m.alias}</span> : null}
              </span>
            ))}
          </div>
        </section>
      )}

      {(erk.venta_publico ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Estado de resultados del periodo
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                <ErLine label="Venta al público (bruta, con IVA)" valor={erk.venta_publico ?? 0} />
                <ErLine label="(−) IVA (16%) → SAT" valor={-(erk.iva ?? 0)} tono="red" />
                <ErLine label="(=) Venta sin IVA" valor={erk.ingreso_sin_iva ?? 0} bold />
                <ErLine label="(−) Comisión Nayax" valor={-(erk.comision_nayax ?? 0)} tono="red" />
                <ErLine
                  label="(=) Venta sin IVA y comisión"
                  valor={(erk.ingreso_sin_iva ?? 0) - (erk.comision_nayax ?? 0)}
                  bold
                />
                <ErLine
                  label="(−) Costo teórico (COGS)"
                  valor={-((erk.costo_polvo ?? 0) + (erk.costo_vaso ?? 0))}
                  tono="red"
                />
                <ErLine label="(=) Utilidad teórica" valor={erk.utilidad ?? 0} bold tono="green" />
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">
            Margen: <strong>{(erk.margen_prom ?? 0).toFixed(1)}%</strong> ·{" "}
            {(erk.n_ventas ?? 0).toLocaleString("es-MX")} tickets · ventana{" "}
            {fmtCDMX(cierre.fecha_inicio_cierre ?? "", { day: "2-digit", month: "short" })}
            {" → "}
            {cierre.fecha_cierre
              ? fmtCDMX(cierre.fecha_cierre, { day: "2-digit", month: "short" })
              : "hoy"}
            . El IVA no es ingreso (se traslada al SAT); costos y utilidad son sin IVA.
          </p>
        </section>
      )}

      {reporte && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Reporte financiero · Global (consolidado)
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Inventario inicio
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                {fmtMxn(reporte.valor_total_inicio)}
              </div>
              <dl className="mt-2 space-y-1 text-xs text-zinc-600">
                <PairR label="Almacén" gramos={reporte.gramos_almacen_inicio} valor={reporte.valor_almacen_inicio} />
                <PairR label="Máquinas" gramos={reporte.gramos_maquinas_inicio} valor={reporte.valor_maquinas_inicio} />
              </dl>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Inventario fin {cierre.estado !== "cerrado" && (
                  <span className="text-amber-700">(provisional · cierre no cerrado)</span>
                )}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                {fmtMxn(reporte.valor_total_fin)}
              </div>
              <dl className="mt-2 space-y-1 text-xs text-zinc-600">
                <PairR label="Almacén" gramos={reporte.gramos_almacen_fin} valor={reporte.valor_almacen_fin} />
                <PairR label="Máquinas" gramos={reporte.gramos_maquinas_fin} valor={reporte.valor_maquinas_fin} />
              </dl>
            </div>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-green-900">
              Consumo real del mes (en máquinas)
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-green-900">
              {fmtMxn(reporte.valor_consumo_calculado)}
            </div>
            <div className="mt-1 text-xs text-green-800">
              {fmtG(reporte.gramos_consumo_calculado)} dispensados
            </div>
            <div className="mt-3 text-[11px] text-green-800">
              Fórmula: inv. máquinas inicio (
              {fmtG(reporte.gramos_maquinas_inicio ?? 0)}) + enviado a
              máquinas ({fmtG(reporte.gramos_enviados_maquinas)}) − inv.
              máquinas fin ({fmtG(reporte.gramos_maquinas_fin ?? 0)})
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Concepto</th>
                  <th className="px-3 py-2 text-right font-medium">Gramos</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                <FilaR label="Cartuchos enviados a máquinas (llenados)" gramos={reporte.gramos_enviados_maquinas} valor={reporte.valor_enviado_maquinas} />
                <FilaR label="Cartuchos devueltos al almacén" gramos={reporte.gramos_devueltos} valor={reporte.valor_devuelto} tono="green" />
                <FilaR label="Mermas autorizadas" gramos={reporte.gramos_merma} valor={reporte.valor_merma} tono="red" />
                <FilaR label="Pesaje · faltante (merma)" gramos={reporte.gramos_pesaje_faltante} valor={reporte.valor_pesaje_faltante} tono="red" />
                <FilaR label="Pesaje · sobrante" gramos={reporte.gramos_pesaje_sobrante} valor={reporte.valor_pesaje_sobrante} tono="green" />
                <FilaR label="Pesaje · neto" gramos={reporte.gramos_ajuste_pesaje} valor={reporte.valor_ajuste_pesaje} />
                <FilaR label="Ajustes por conteo de almacén" gramos={reporte.gramos_ajuste_almacen} valor={reporte.valor_ajuste_almacen} />
                <FilaR
                  label={`Costo de ventas · Nayax (${reporte.num_ventas_nayax.toLocaleString("es-MX")} tickets)`}
                  gramos={reporte.gramos_venta_nayax}
                  valor={reporte.valor_venta_nayax}
                  tono="green"
                />
              </tbody>
            </table>
          </div>
        </section>
      )}

      {snapsCliente.map(({ cliente, snap, er }) => {
        const r = resumenPorCliente.get(cliente.id);
        const skus = Array.from(
          (skusPorCliente.get(cliente.id) ?? new Map<string, SkuRow>()).values(),
        ).sort((a, b) => a.nombre.localeCompare(b.nombre));
        return (
          <BloqueClienteFinanciero
            key={cliente.id}
            nombre={cliente.nombre}
            snap={snap}
            inventario={
              r
                ? {
                    inicio: r.inicio,
                    fin: r.fin,
                    consumo: r.maqIni + r.enviado - r.maqFin,
                    aprox: r.aprox,
                  }
                : null
            }
            skus={skus}
            er={er}
          />
        );
      })}

      {resumenPesaje.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Variación de pesaje por producto (consolidado)
          </h2>
          <p className="text-sm text-zinc-500">
            Teórico (lo que el sistema esperaba) vs. medido (pesaje físico en
            polvo, conteo en vasos), sumando todas las máquinas pesadas del
            cierre.
          </p>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Teórico</th>
                  <th className="px-3 py-2 text-right font-medium">Medido</th>
                  <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                  <th className="px-3 py-2 text-right font-medium">Variación</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {resumenPesaje.map((r) => {
                  const pct =
                    r.teorico > 0 ? (r.dif / r.teorico) * 100 : 0;
                  const tone =
                    r.dif < 0
                      ? "text-red-700"
                      : r.dif > 0
                        ? "text-amber-700"
                        : "text-zinc-500";
                  const cant = (n: number) =>
                    r.esVaso ? `${n.toLocaleString("es-MX")} u` : fmtG(n);
                  return (
                    <tr key={r.sku}>
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {r.nombre}
                          {r.esVaso && (
                            <span className="ml-1 rounded bg-zinc-100 px-1 text-[10px] text-zinc-500">
                              vaso
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-zinc-500">
                          {r.sku}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {cant(r.teorico)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {cant(r.medido)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${tone}`}>
                        {r.dif > 0 ? "+" : ""}
                        {cant(r.dif)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${tone}`}>
                        {pct > 0 ? "+" : ""}
                        {pct.toFixed(1)}%
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${tone}`}>
                        {fmtMxn(r.valor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-zinc-200 bg-zinc-50">
                <tr>
                  <td className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Total (polvo en g; valor incluye vasos)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {fmtG(resumenPesaje.filter((r) => !r.esVaso).reduce((s, r) => s + r.teorico, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {fmtG(resumenPesaje.filter((r) => !r.esVaso).reduce((s, r) => s + r.medido, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtG(totalDiferenciaG)}
                  </td>
                  <td className="px-3 py-2" />
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      totalValorDiferencia < 0 ? "text-red-700" : "text-zinc-900"
                    }`}
                  >
                    {fmtMxn(totalValorDiferencia)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Pesajes del periodo
        </h2>
        {(pesajes ?? []).length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
            Aún no hay pesajes. Cuando los operadores pasen por las máquinas
            y registren peso, aparecerán aquí.
          </div>
        ) : (
          <div className="space-y-3">
            {(pesajes ?? []).map((p) => {
              const maq = Array.isArray(p.maquina) ? p.maquina[0] : p.maquina;
              const op = Array.isArray(p.operador)
                ? p.operador[0]
                : p.operador;
              const items = Array.isArray(p.items) ? p.items : [];
              return (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
                >
                  <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                    <div>
                      <div className="font-mono text-sm font-semibold">
                        {maq?.serie ?? "—"}
                      </div>
                      {maq?.alias && (
                        <div className="text-xs text-zinc-600">
                          {maq.alias}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-zinc-600">
                      <div>{op?.full_name}</div>
                      <div>
                        {fmtCDMX(p.fecha, {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </header>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-3 py-1 font-medium">Tolva</th>
                        <th className="px-3 py-1 font-medium">Producto</th>
                        <th className="px-3 py-1 text-right font-medium">
                          Teórico
                        </th>
                        <th className="px-3 py-1 text-right font-medium">
                          Medido
                        </th>
                        <th className="px-3 py-1 text-right font-medium">
                          Dif.
                        </th>
                        <th className="px-3 py-1 text-right font-medium">
                          %
                        </th>
                        <th className="px-3 py-1 text-right font-medium">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {items.map(
                        (it: {
                          id: string;
                          gramos_medidos: number;
                          gramos_teoricos: number;
                          diferencia_gramos: number | null;
                          diferencia_porcentaje: number | null;
                          valor_diferencia: number | null;
                          alerta_generada: boolean;
                          tolva: {
                            numero: number;
                            producto: { sku: string; nombre: string } | null;
                          } | { numero: number; producto: { sku: string; nombre: string } | null }[] | null;
                        }) => {
                          const t = Array.isArray(it.tolva)
                            ? it.tolva[0]
                            : it.tolva;
                          const prod = t?.producto
                            ? Array.isArray(t.producto)
                              ? t.producto[0]
                              : t.producto
                            : null;
                          const dif = it.diferencia_gramos ?? 0;
                          const tone =
                            dif < 0
                              ? "text-red-700"
                              : dif > 0
                                ? "text-amber-700"
                                : "text-zinc-700";
                          return (
                            <tr
                              key={it.id}
                              className={
                                it.alerta_generada ? "bg-red-50" : undefined
                              }
                            >
                              <td className="px-3 py-1 font-mono">
                                #{t?.numero ?? "?"}
                              </td>
                              <td className="px-3 py-1">
                                {prod?.nombre ?? "—"}
                                <div className="font-mono text-[10px] text-zinc-500">
                                  {prod?.sku ?? ""}
                                </div>
                              </td>
                              <td className="px-3 py-1 text-right tabular-nums">
                                {it.gramos_teoricos}g
                              </td>
                              <td className="px-3 py-1 text-right">
                                <PesajeItemEditor
                                  itemId={it.id}
                                  cierreId={cierre.id}
                                  gramosMedidos={it.gramos_medidos}
                                  editable={cierre.estado !== "cerrado"}
                                />
                              </td>
                              <td
                                className={`px-3 py-1 text-right tabular-nums font-medium ${tone}`}
                              >
                                {dif > 0 ? "+" : ""}
                                {dif}g
                              </td>
                              <td
                                className={`px-3 py-1 text-right tabular-nums ${tone}`}
                              >
                                {it.diferencia_porcentaje != null
                                  ? `${it.diferencia_porcentaje > 0 ? "+" : ""}${it.diferencia_porcentaje}%`
                                  : "—"}
                              </td>
                              <td
                                className={`px-3 py-1 text-right tabular-nums ${tone}`}
                              >
                                $
                                {Number(it.valor_diferencia ?? 0).toLocaleString(
                                  "es-MX",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {cierre.estado !== "cerrado" && (
        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">
            Cerrar periodo
          </h2>
          <ul className="space-y-1 text-xs">
            <li
              className={
                cierre.conteo_almacen_completado
                  ? "text-green-700"
                  : "text-amber-700"
              }
            >
              {cierre.conteo_almacen_completado ? "✓" : "○"} Conteo de
              almacén aplicado
            </li>
            <li
              className={
                maquinasPendientes.length === 0
                  ? "text-green-700"
                  : "text-amber-700"
              }
            >
              {maquinasPendientes.length === 0 ? "✓" : "○"} Máquinas pesadas:{" "}
              {maquinasPesadasCount}/{totalMaquinas}
              {maquinasPendientes.length > 0
                ? ` — faltan ${maquinasPendientes.length}`
                : ""}
            </li>
          </ul>
          <form action={cerrarCierre} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={cierre.id} />
            {!cierre.conteo_almacen_completado && (
              <label className="flex items-center gap-2 text-xs text-amber-800">
                <input
                  type="checkbox"
                  name="force"
                  value="1"
                  className="h-4 w-4"
                />
                Cerrar sin conteo de almacén (forzado)
              </label>
            )}
            <button
              type="submit"
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-800"
            >
              Cerrar periodo
            </button>
          </form>
          <p className="text-xs text-zinc-500">
            Al cerrar se toma snapshot de máquinas pesadas y total activas.
            En v1 el sistema no bloquea físicamente movimientos posteriores
            con fecha del mes cerrado; respétalo por proceso.
          </p>
        </section>
      )}

      {cierre.estado === "cerrado" && (
        <section className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-900">Periodo cerrado</p>
          <p className="mt-1 text-xs text-green-800">
            {cierre.maquinas_pesadas} de {cierre.total_maquinas_periodo}{" "}
            máquinas activas pesadas.
          </p>
        </section>
      )}
    </div>
  );
}

const TIPO_MOV_LABEL: Record<string, string> = {
  ajuste_conteo_maquina: "Ajuste por pesaje en máquina",
  ajuste_conteo_almacen: "Ajuste por conteo de almacén",
  merma_ruta: "Merma en ruta",
  merma_encartuchado: "Merma en encartuchado",
  ajuste_manual: "Ajuste manual",
};

function BloqueClienteFinanciero({
  nombre,
  snap,
  inventario,
  skus,
  er,
}: {
  nombre: string;
  snap: SnapshotCierre;
  inventario: {
    inicio: number;
    fin: number;
    consumo: number;
    aprox: boolean;
  } | null;
  skus: { sku: string; nombre: string; inicio: number; fin: number }[];
  er: {
    venta_publico?: number;
    iva?: number;
    ingreso_sin_iva?: number;
    comision_nayax?: number;
    costo_polvo?: number;
    costo_vaso?: number;
    utilidad?: number;
    margen_prom?: number;
    n_ventas?: number;
  } | null;
}) {
  const inv = snap.inventario_fin;
  const vn = snap.ventas_nayax;
  const costoVentas = vn.costo_polvo + vn.costo_vaso;
  const merma = inventario ? inventario.consumo - costoVentas : 0;
  return (
    <section className="space-y-3 border-t border-zinc-200 pt-5">
      <h2 className="text-lg font-semibold tracking-tight">
        Reporte financiero · {nombre}
      </h2>

      {er && (er.venta_publico ?? 0) > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Estado de resultados · {nombre}
          </h3>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                <ErLine label="Venta al público (bruta, con IVA)" valor={er.venta_publico ?? 0} />
                <ErLine label="(−) IVA (16%) → SAT" valor={-(er.iva ?? 0)} tono="red" />
                <ErLine label="(=) Venta sin IVA" valor={er.ingreso_sin_iva ?? 0} bold />
                <ErLine label="(−) Comisión Nayax" valor={-(er.comision_nayax ?? 0)} tono="red" />
                <ErLine
                  label="(=) Venta sin IVA y comisión"
                  valor={(er.ingreso_sin_iva ?? 0) - (er.comision_nayax ?? 0)}
                  bold
                />
                <ErLine
                  label="(−) Costo teórico (COGS)"
                  valor={-((er.costo_polvo ?? 0) + (er.costo_vaso ?? 0))}
                  tono="red"
                />
                <ErLine label="(=) Utilidad teórica" valor={er.utilidad ?? 0} bold tono="green" />
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-zinc-500">
            Margen: <strong>{(er.margen_prom ?? 0).toFixed(1)}%</strong> ·{" "}
            {(er.n_ventas ?? 0).toLocaleString("es-MX")} tickets
          </p>
        </div>
      )}

      {inventario && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Inventario inicial
              {inventario.aprox && (
                <span className="ml-1 text-[10px] text-amber-600">(aprox)</span>
              )}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
              {fmtMxn(inventario.inicio)}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Inventario final
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
              {fmtMxn(inventario.fin)}
            </div>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-green-900">
              Consumo real · COGS (polvo + vaso)
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-green-900">
              {fmtMxn(inventario.consumo)}
            </div>
            <div className="mt-1 text-[11px] text-green-800">
              inicial máq + enviado − final máq
            </div>
          </div>
          <div
            className={`rounded-lg border p-4 ${
              merma > 0 ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"
            }`}
          >
            <div
              className={`text-xs font-medium uppercase tracking-wide ${
                merma > 0 ? "text-red-900" : "text-zinc-500"
              }`}
            >
              Merma (consumo − ventas)
            </div>
            <div
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                merma > 0 ? "text-red-700" : "text-zinc-900"
              }`}
            >
              {fmtMxn(merma)}
            </div>
            <div
              className={`mt-1 text-[11px] ${merma > 0 ? "text-red-800" : "text-zinc-500"}`}
            >
              consumo físico − costo de ventas
            </div>
          </div>
        </div>
      )}

      {skus.length > 0 && (
        <details className="rounded-lg border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-zinc-700">
            Detalle por producto (SKU) — inventario inicial vs final
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-t border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Inicial</th>
                  <th className="px-3 py-2 text-right font-medium">Final</th>
                  <th className="px-3 py-2 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {skus.map((s) => {
                  const delta = s.fin - s.inicio;
                  return (
                    <tr key={s.sku}>
                      <td className="px-3 py-1.5">
                        <div className="font-medium">{s.nombre}</div>
                        <div className="font-mono text-[10px] text-zinc-500">
                          {s.sku}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">
                        {fmtMxn(s.inicio)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">
                        {fmtMxn(s.fin)}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                          delta < 0 ? "text-red-700" : delta > 0 ? "text-green-700" : "text-zinc-500"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {fmtMxn(delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Inventario al corte (actual) atribuido al cliente */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Inventario al corte (actual)
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
            {fmtMxn(inv.total)}
          </div>
          <dl className="mt-2 space-y-1 text-xs text-zinc-600">
            <PairR
              label="Almacén · granel"
              gramos={inv.almacen.polvo_granel.gramos}
              valor={inv.almacen.polvo_granel.valor}
            />
            <PairR
              label="Almacén · cartuchos"
              gramos={inv.almacen.polvo_cartuchos.gramos}
              valor={inv.almacen.polvo_cartuchos.valor}
            />
            <div className="flex items-baseline justify-between">
              <span>Almacén · vasos</span>
              <span className="tabular-nums">
                {inv.almacen.vasos.unidades.toLocaleString("es-MX")} u ·{" "}
                <span className="font-medium">
                  {fmtMxn(inv.almacen.vasos.valor)}
                </span>
              </span>
            </div>
            <PairR
              label="Máquinas · polvo"
              gramos={inv.maquinas.polvo_tolvas.gramos}
              valor={inv.maquinas.polvo_tolvas.valor}
            />
            <div className="flex items-baseline justify-between">
              <span>Máquinas · vasos</span>
              <span className="tabular-nums">
                {inv.maquinas.vasos.unidades.toLocaleString("es-MX")} u ·{" "}
                <span className="font-medium">
                  {fmtMxn(inv.maquinas.vasos.valor)}
                </span>
              </span>
            </div>
          </dl>
          <div className="mt-2 flex justify-between border-t border-zinc-100 pt-2 text-xs text-zinc-600">
            <span>Subtotal almacén / máquinas</span>
            <span className="tabular-nums font-medium">
              {fmtMxn(inv.almacen.subtotal)} / {fmtMxn(inv.maquinas.subtotal)}
            </span>
          </div>
        </div>

        {/* Ventas Nayax del periodo */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Ventas Nayax del periodo
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-green-900">
            {fmtMxn(vn.neto)}
          </div>
          <div className="mt-1 text-xs text-zinc-600">
            {vn.transacciones.toLocaleString("es-MX")} transacciones ·{" "}
            {fmtG(vn.gramos_dispensados)} dispensados
          </div>
          <dl className="mt-2 space-y-1 text-xs text-zinc-600">
            <div className="flex justify-between">
              <span>Costo (polvo + vaso)</span>
              <span className="tabular-nums font-medium">
                {fmtMxn(costoVentas)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Utilidad bruta</span>
              <span className="tabular-nums font-medium text-green-700">
                {fmtMxn(vn.utilidad)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Margen</span>
              <span className="tabular-nums font-medium">{vn.margen_pct}%</span>
            </div>
          </dl>
        </div>
      </div>

      {snap.ajustes_mermas.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Ajuste / merma</th>
                <th className="px-3 py-2 text-right font-medium">Mov.</th>
                <th className="px-3 py-2 text-right font-medium">Gramos</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {snap.ajustes_mermas.map((a) => (
                <tr key={a.tipo}>
                  <td className="px-3 py-1.5 text-zinc-700">
                    {TIPO_MOV_LABEL[a.tipo] ?? a.tipo}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">
                    {a.movimientos}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">
                    {fmtG(a.gramos)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    {fmtMxn(a.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-500">
        Inventario atribuido al cliente vía productos exclusivos (mismo cálculo
        del panel de inventario y del Excel por-cliente). Es el corte actual; la
        comparación inicio→fin y el consumo calculado solo viven en el bloque
        global.
      </p>
    </section>
  );
}

function ErLine({
  label,
  valor,
  bold,
  tono,
}: {
  label: string;
  valor: number;
  bold?: boolean;
  tono?: "red" | "green";
}) {
  const cls =
    tono === "red"
      ? "text-red-700"
      : tono === "green"
        ? "text-green-700"
        : "text-zinc-900";
  return (
    <tr className={bold ? "bg-zinc-50" : undefined}>
      <td
        className={`px-3 py-2 ${bold ? "font-semibold text-zinc-900" : "text-zinc-700"}`}
      >
        {label}
      </td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${bold ? "font-semibold" : "font-medium"} ${cls}`}
      >
        {fmtMxn(valor)}
      </td>
    </tr>
  );
}

function fmtMxn(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtG(g: number | null | undefined): string {
  const v = Number(g ?? 0);
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(2)} kg`;
  return `${v} g`;
}

function PairR({
  label,
  gramos,
  valor,
}: {
  label: string;
  gramos: number | null | undefined;
  valor: number | null | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span>{label}</span>
      <span className="tabular-nums">
        {fmtG(gramos)} · <span className="font-medium">{fmtMxn(valor)}</span>
      </span>
    </div>
  );
}

function FilaR({
  label,
  gramos,
  valor,
  tono,
}: {
  label: string;
  gramos: number | null | undefined;
  valor: number | null | undefined;
  tono?: "green" | "red";
}) {
  const cls = tono === "green" ? "text-green-700" : tono === "red" ? "text-red-700" : "text-zinc-900";
  return (
    <tr>
      <td className="px-3 py-1.5 text-zinc-700">{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">{fmtG(gramos)}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${cls}`}>{fmtMxn(valor)}</td>
    </tr>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "red" | "amber" | "zinc";
}) {
  const color =
    tone === "red"
      ? "text-red-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] text-zinc-500">{hint}</div>}
    </div>
  );
}
