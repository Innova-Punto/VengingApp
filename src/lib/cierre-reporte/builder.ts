// Construye el snapshot del cierre mensual: ventas, costos, inventario,
// ajustes, intercompany. Se consume desde el server action que genera Excel.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type Sb = SupabaseClient<Database>;

function startOfMonthCDMX(mes: number, anio: number): string {
  // ISO con offset CDMX (UTC-6, sin DST). 00:00 CDMX = 06:00 UTC.
  return `${anio}-${String(mes).padStart(2, "0")}-01T06:00:00.000Z`;
}
function startOfNextMonthCDMX(mes: number, anio: number): string {
  const nextMes = mes === 12 ? 1 : mes + 1;
  const nextAnio = mes === 12 ? anio + 1 : anio;
  return startOfMonthCDMX(nextMes, nextAnio);
}

export type SnapshotCierre = {
  periodo: {
    mes: number;
    anio: number;
    desde: string;
    hasta: string;
    generado_at: string;
  };
  ventas_nayax: {
    transacciones: number;
    bruto: number;
    comision: number;
    neto: number;
    costo_polvo: number;
    costo_vaso: number;
    utilidad: number;
    margen_pct: number;
    gramos_dispensados: number;
    ticket_promedio: number;
    por_cliente: Array<{
      cliente: string;
      ventas: number;
      neto: number;
      costo_polvo: number;
      costo_vaso: number;
      utilidad: number;
      margen_pct: number;
    }>;
    por_maquina: Array<{
      serie: string;
      alias: string;
      cliente: string;
      visitas: number;
      ventas: number;
      neto: number;
      costo: number;
      utilidad: number;
      margen_pct: number;
      gramos: number;
    }>;
    por_producto: Array<{
      sku: string;
      nombre: string;
      ventas: number;
      gramos: number;
      neto: number;
      costo: number;
      utilidad: number;
    }>;
  };
  ventas_intercompany: {
    transacciones: number;
    costo: number;
    venta: number;
    utilidad: number;
    por_empresa: Array<{
      empresa: string;
      ventas: number;
      costo: number;
      venta: number;
      utilidad: number;
    }>;
  };
  compras: {
    recepciones: number;
    monto_total: number;
    por_proveedor: Array<{
      proveedor: string;
      recepciones: number;
      monto: number;
    }>;
  };
  ajustes_mermas: Array<{
    tipo: string;
    movimientos: number;
    cantidad_cartuchos: number;
    cantidad_vasos: number;
    gramos: number;
    valor: number;
  }>;
  inventario_fin: {
    almacen: {
      polvo_granel: { gramos: number; valor: number };
      polvo_cartuchos: { unidades: number; gramos: number; valor: number };
      vasos: { unidades: number; valor: number };
      subtotal: number;
    };
    maquinas: {
      polvo_tolvas: { gramos: number; valor: number };
      vasos: { unidades: number; valor: number };
      subtotal: number;
      por_cliente: Array<{
        cliente: string;
        maquinas: number;
        gramos_polvo: number;
        valor_polvo: number;
        unidades_vasos: number;
        valor_vasos: number;
        total: number;
      }>;
    };
    total: number;
  };
};

export async function construirSnapshotCierre(
  supabase: Sb,
  cierreId: string,
  clienteId?: string | null,
): Promise<SnapshotCierre> {
  // 1) Cierre y periodo
  const { data: cierre, error: errCierre } = await supabase
    .from("cierres_mensuales")
    .select("id, periodo_mes, periodo_anio")
    .eq("id", cierreId)
    .maybeSingle();
  if (errCierre || !cierre) throw new Error("Cierre no encontrado");

  const desde = startOfMonthCDMX(cierre.periodo_mes, cierre.periodo_anio);
  const hasta = startOfNextMonthCDMX(cierre.periodo_mes, cierre.periodo_anio);

  // Si se filtra por cliente: lista de productos atribuibles a ese cliente
  // (exclusivos + usados en sus máquinas), vía la misma lógica del panel de
  // inventario (función productos_de_cliente).
  let productosClienteSet: Set<string> | null = null;
  if (clienteId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prodIds } = await (supabase as any).rpc(
      "productos_de_cliente",
      { p_cliente_id: clienteId },
    );
    productosClienteSet = new Set(
      ((prodIds ?? []) as string[]).map((x) => x),
    );
  }

  // 2) Ventas Nayax del periodo
  type VRow = {
    id: string;
    maquina_id: string | null;
    producto_id: string | null;
    cliente_id: string | null;
    precio_bruto: number | string | null;
    comision_nayax_estimada: number | string | null;
    precio_neto: number | string | null;
    costo_polvo: number | string | null;
    costo_vaso: number | string | null;
    utilidad_bruta: number | string | null;
    gramos_dispensados: number | null;
  };
  let ventasQuery = supabase
    .from("ventas_maquina")
    .select(
      "id, maquina_id, producto_id, cliente_id, precio_bruto, comision_nayax_estimada, precio_neto, costo_polvo, costo_vaso, utilidad_bruta, gramos_dispensados, fecha_transaccion",
    )
    .gte("fecha_transaccion", desde)
    .lt("fecha_transaccion", hasta);
  if (clienteId) ventasQuery = ventasQuery.eq("cliente_id", clienteId);
  const { data: ventas } = await ventasQuery.range(0, 200000);
  const vArr: VRow[] = (ventas ?? []) as unknown as VRow[];

  const sum = (arr: VRow[], k: keyof VRow): number =>
    arr.reduce((s, v) => s + Number(v[k] ?? 0), 0);

  const totalVentas = vArr.length;
  const totalBruto = sum(vArr, "precio_bruto");
  const totalComision = sum(vArr, "comision_nayax_estimada");
  const totalNeto = sum(vArr, "precio_neto");
  const totalCostoPolvo = sum(vArr, "costo_polvo");
  const totalCostoVaso = sum(vArr, "costo_vaso");
  const totalUtilidad = sum(vArr, "utilidad_bruta");
  const totalGramos = sum(vArr, "gramos_dispensados");

  // Catálogos para nombres
  const maquinaIds = Array.from(
    new Set(vArr.map((v) => v.maquina_id).filter((x): x is string => !!x)),
  );
  const productoIds = Array.from(
    new Set(vArr.map((v) => v.producto_id).filter((x): x is string => !!x)),
  );
  const clienteIds = Array.from(
    new Set(vArr.map((v) => v.cliente_id).filter((x): x is string => !!x)),
  );

  type MaqLite = {
    id: string;
    serie: string;
    alias: string | null;
    ubicacion_id: string | null;
  };
  type UbicLite = { id: string; cliente_id: string | null };
  type CliLite = { id: string; nombre: string };
  type ProdLite = { id: string; sku: string; nombre: string };

  const [{ data: maquinas }, { data: productosCat }, { data: clientesCat }] =
    await Promise.all([
      maquinaIds.length > 0
        ? supabase
            .from("maquinas")
            .select("id, serie, alias, ubicacion_id")
            .in("id", maquinaIds)
        : Promise.resolve({ data: [] as MaqLite[] }),
      productoIds.length > 0
        ? supabase
            .from("productos")
            .select("id, sku, nombre")
            .in("id", productoIds)
        : Promise.resolve({ data: [] as ProdLite[] }),
      clienteIds.length > 0
        ? supabase
            .from("clientes")
            .select("id, nombre")
            .in("id", clienteIds)
        : Promise.resolve({ data: [] as CliLite[] }),
    ]);
  const mArr = (maquinas ?? []) as MaqLite[];
  const ubicIds = Array.from(
    new Set(mArr.map((m) => m.ubicacion_id).filter((x): x is string => !!x)),
  );
  const { data: ubicaciones } =
    ubicIds.length > 0
      ? await supabase.from("ubicaciones").select("id, cliente_id").in("id", ubicIds)
      : { data: [] as UbicLite[] };
  const ubicMap = new Map<string, string | null>();
  for (const u of (ubicaciones ?? []) as UbicLite[])
    ubicMap.set(u.id, u.cliente_id);

  const maqInfo = new Map<
    string,
    { serie: string; alias: string; clienteId: string | null }
  >();
  for (const m of mArr) {
    maqInfo.set(m.id, {
      serie: m.serie,
      alias: m.alias ?? "",
      clienteId: m.ubicacion_id ? (ubicMap.get(m.ubicacion_id) ?? null) : null,
    });
  }
  const cliInfo = new Map<string, string>();
  for (const c of (clientesCat ?? []) as CliLite[]) cliInfo.set(c.id, c.nombre);
  const prodInfo = new Map<string, { sku: string; nombre: string }>();
  for (const p of (productosCat ?? []) as ProdLite[])
    prodInfo.set(p.id, { sku: p.sku, nombre: p.nombre });

  // Visitas por máquina (check_ins en periodo)
  const { data: checkIns } = await supabase
    .from("check_ins")
    .select("maquina_id, fecha_entrada")
    .gte("fecha_entrada", desde)
    .lt("fecha_entrada", hasta)
    .range(0, 200000);
  const visitasPorMaquina = new Map<string, number>();
  for (const ci of checkIns ?? []) {
    visitasPorMaquina.set(
      ci.maquina_id,
      (visitasPorMaquina.get(ci.maquina_id) ?? 0) + 1,
    );
  }

  // Agregaciones por cliente, máquina, producto
  const porCliente = new Map<
    string,
    {
      ventas: number;
      neto: number;
      costo_polvo: number;
      costo_vaso: number;
      utilidad: number;
    }
  >();
  const porMaquina = new Map<
    string,
    {
      ventas: number;
      neto: number;
      costo: number;
      utilidad: number;
      gramos: number;
    }
  >();
  const porProducto = new Map<
    string,
    {
      ventas: number;
      gramos: number;
      neto: number;
      costo: number;
      utilidad: number;
    }
  >();

  for (const v of vArr) {
    if (v.cliente_id) {
      const cur = porCliente.get(v.cliente_id) ?? {
        ventas: 0,
        neto: 0,
        costo_polvo: 0,
        costo_vaso: 0,
        utilidad: 0,
      };
      cur.ventas += 1;
      cur.neto += Number(v.precio_neto ?? 0);
      cur.costo_polvo += Number(v.costo_polvo ?? 0);
      cur.costo_vaso += Number(v.costo_vaso ?? 0);
      cur.utilidad += Number(v.utilidad_bruta ?? 0);
      porCliente.set(v.cliente_id, cur);
    }
    if (v.maquina_id) {
      const cur = porMaquina.get(v.maquina_id) ?? {
        ventas: 0,
        neto: 0,
        costo: 0,
        utilidad: 0,
        gramos: 0,
      };
      cur.ventas += 1;
      cur.neto += Number(v.precio_neto ?? 0);
      cur.costo +=
        Number(v.costo_polvo ?? 0) + Number(v.costo_vaso ?? 0);
      cur.utilidad += Number(v.utilidad_bruta ?? 0);
      cur.gramos += v.gramos_dispensados ?? 0;
      porMaquina.set(v.maquina_id, cur);
    }
    if (v.producto_id) {
      const cur = porProducto.get(v.producto_id) ?? {
        ventas: 0,
        gramos: 0,
        neto: 0,
        costo: 0,
        utilidad: 0,
      };
      cur.ventas += 1;
      cur.gramos += v.gramos_dispensados ?? 0;
      cur.neto += Number(v.precio_neto ?? 0);
      cur.costo +=
        Number(v.costo_polvo ?? 0) + Number(v.costo_vaso ?? 0);
      cur.utilidad += Number(v.utilidad_bruta ?? 0);
      porProducto.set(v.producto_id, cur);
    }
  }

  // 3) Ventas intercompany del periodo
  type VICRow = {
    empresa_destino_id: string;
    costo_total: number | string;
    precio_venta_neto: number | string;
    utilidad: number | string;
  };
  const { data: vic } = await supabase
    .from("ventas_intercompany")
    .select(
      "empresa_destino_id, costo_total, precio_venta_neto, utilidad, fecha",
    )
    .gte("fecha", desde)
    .lt("fecha", hasta)
    .range(0, 50000);
  const vicArr: VICRow[] = (vic ?? []) as unknown as VICRow[];
  const vicEmpresaIds = Array.from(
    new Set(vicArr.map((v) => v.empresa_destino_id)),
  );
  const { data: vicEmpresas } =
    vicEmpresaIds.length > 0
      ? await supabase
          .from("clientes")
          .select("id, nombre")
          .in("id", vicEmpresaIds)
      : { data: [] as CliLite[] };
  const vicEmpresaMap = new Map<string, string>();
  for (const c of (vicEmpresas ?? []) as CliLite[])
    vicEmpresaMap.set(c.id, c.nombre);

  const vicPorEmpresa = new Map<
    string,
    { ventas: number; costo: number; venta: number; utilidad: number }
  >();
  for (const v of vicArr) {
    const cur = vicPorEmpresa.get(v.empresa_destino_id) ?? {
      ventas: 0,
      costo: 0,
      venta: 0,
      utilidad: 0,
    };
    cur.ventas += 1;
    cur.costo += Number(v.costo_total ?? 0);
    cur.venta += Number(v.precio_venta_neto ?? 0);
    cur.utilidad += Number(v.utilidad ?? 0);
    vicPorEmpresa.set(v.empresa_destino_id, cur);
  }

  // 4) Compras / recepciones del periodo
  type RecRow = {
    proveedor_id: string;
    valor_total: number | string | null;
  };
  const { data: recepciones } = await supabase
    .from("recepciones")
    .select("proveedor_id, valor_total, fecha_recepcion")
    .gte("fecha_recepcion", desde)
    .lt("fecha_recepcion", hasta)
    .range(0, 5000);
  const recArr: RecRow[] = (recepciones ?? []) as unknown as RecRow[];
  const recProvIds = Array.from(new Set(recArr.map((r) => r.proveedor_id)));
  const { data: provs } =
    recProvIds.length > 0
      ? await supabase
          .from("proveedores")
          .select("id, nombre")
          .in("id", recProvIds)
      : { data: [] as { id: string; nombre: string }[] };
  const provMap = new Map<string, string>();
  for (const p of provs ?? []) provMap.set(p.id, p.nombre);

  const recPorProv = new Map<
    string,
    { recepciones: number; monto: number }
  >();
  for (const r of recArr) {
    const cur = recPorProv.get(r.proveedor_id) ?? { recepciones: 0, monto: 0 };
    cur.recepciones += 1;
    cur.monto += Number(r.valor_total ?? 0);
    recPorProv.set(r.proveedor_id, cur);
  }

  // 5) Ajustes y mermas — agrupar movimientos_inventario por tipo
  type MovRow = {
    tipo: string;
    producto_id: string | null;
    cantidad_cartuchos: number | null;
    cantidad_vasos: number | null;
    gramos: number | null;
    valor_movimiento: number | string | null;
  };
  const { data: movs } = await supabase
    .from("movimientos_inventario")
    .select(
      "tipo, producto_id, cantidad_cartuchos, cantidad_vasos, gramos, valor_movimiento, fecha",
    )
    .in("tipo", [
      "ajuste_conteo_maquina",
      "ajuste_conteo_almacen",
      "merma_ruta",
      "merma_encartuchado",
      "ajuste_manual",
    ])
    .gte("fecha", desde)
    .lt("fecha", hasta)
    .range(0, 50000);
  const movArr: MovRow[] = ((movs ?? []) as unknown as MovRow[]).filter(
    (m) =>
      !productosClienteSet ||
      (m.producto_id != null && productosClienteSet.has(m.producto_id)),
  );
  const ajustesPorTipo = new Map<
    string,
    {
      movimientos: number;
      cantidad_cartuchos: number;
      cantidad_vasos: number;
      gramos: number;
      valor: number;
    }
  >();
  for (const m of movArr) {
    const cur = ajustesPorTipo.get(m.tipo) ?? {
      movimientos: 0,
      cantidad_cartuchos: 0,
      cantidad_vasos: 0,
      gramos: 0,
      valor: 0,
    };
    cur.movimientos += 1;
    cur.cantidad_cartuchos += m.cantidad_cartuchos ?? 0;
    cur.cantidad_vasos += m.cantidad_vasos ?? 0;
    cur.gramos += m.gramos ?? 0;
    cur.valor += Number(m.valor_movimiento ?? 0);
    ajustesPorTipo.set(m.tipo, cur);
  }

  // 6) Inventario al cierre — calculado SOBRE EL ESTADO ACTUAL.
  //    Global: snapshot_inventario_desglosado (incluye desglose por cliente).
  //    Por cliente: capital_trabajo(clienteId) — mismo cálculo del panel de
  //    inventario, atribuyendo almacén vía productos exclusivos del cliente.
  let inv: unknown = null;
  if (clienteId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ct } = await (supabase as any).rpc("capital_trabajo", {
      p_cliente_id: clienteId,
    });
    const row = Array.isArray(ct) ? ct[0] : ct;
    if (row) {
      inv = {
        almacen_granel_gramos: row.alm_granel_gramos,
        almacen_granel_valor: row.alm_granel_valor,
        almacen_cartuchos_unidades: row.alm_cartuchos_unidades,
        almacen_cartuchos_gramos: row.alm_cartuchos_gramos,
        almacen_cartuchos_valor: row.alm_cartuchos_valor,
        almacen_vasos_unidades: row.alm_vasos_unidades,
        almacen_vasos_valor: row.alm_vasos_valor,
        maquinas_polvo_gramos: row.maq_polvo_gramos,
        maquinas_polvo_valor: row.maq_polvo_valor,
        maquinas_vasos_unidades: row.maq_vasos_unidades,
        maquinas_vasos_valor: row.maq_vasos_valor,
        por_cliente: [],
      };
    }
  } else {
    const { data: invGlobal } = await supabase.rpc(
      "snapshot_inventario_desglosado",
    );
    inv = invGlobal;
  }
  type InvSnap = {
    almacen_granel_gramos: number;
    almacen_granel_valor: number;
    almacen_cartuchos_unidades: number;
    almacen_cartuchos_gramos: number;
    almacen_cartuchos_valor: number;
    almacen_vasos_unidades: number;
    almacen_vasos_valor: number;
    maquinas_polvo_gramos: number;
    maquinas_polvo_valor: number;
    maquinas_vasos_unidades: number;
    maquinas_vasos_valor: number;
    por_cliente: Array<{
      cliente: string;
      maquinas: number;
      gramos_polvo: number;
      valor_polvo: number;
      unidades_vasos: number;
      valor_vasos: number;
      total: number;
    }>;
  };
  const invSnap = (inv as unknown as InvSnap) ?? null;

  const almacenSub = invSnap
    ? Number(invSnap.almacen_granel_valor) +
      Number(invSnap.almacen_cartuchos_valor) +
      Number(invSnap.almacen_vasos_valor)
    : 0;
  const maquinasSub = invSnap
    ? Number(invSnap.maquinas_polvo_valor) +
      Number(invSnap.maquinas_vasos_valor)
    : 0;

  // Armar snapshot final
  return {
    periodo: {
      mes: cierre.periodo_mes,
      anio: cierre.periodo_anio,
      desde,
      hasta,
      generado_at: new Date().toISOString(),
    },
    ventas_nayax: {
      transacciones: totalVentas,
      bruto: totalBruto,
      comision: totalComision,
      neto: totalNeto,
      costo_polvo: totalCostoPolvo,
      costo_vaso: totalCostoVaso,
      utilidad: totalUtilidad,
      margen_pct:
        totalNeto > 0
          ? Math.round((totalUtilidad / totalNeto) * 10000) / 100
          : 0,
      gramos_dispensados: totalGramos,
      ticket_promedio: totalVentas > 0 ? totalNeto / totalVentas : 0,
      por_cliente: Array.from(porCliente.entries())
        .map(([id, v]) => ({
          cliente: cliInfo.get(id) ?? "—",
          ventas: v.ventas,
          neto: v.neto,
          costo_polvo: v.costo_polvo,
          costo_vaso: v.costo_vaso,
          utilidad: v.utilidad,
          margen_pct:
            v.neto > 0
              ? Math.round((v.utilidad / v.neto) * 10000) / 100
              : 0,
        }))
        .sort((a, b) => b.neto - a.neto),
      por_maquina: Array.from(porMaquina.entries())
        .map(([id, v]) => {
          const info = maqInfo.get(id);
          return {
            serie: info?.serie ?? "—",
            alias: info?.alias ?? "",
            cliente:
              info?.clienteId ? (cliInfo.get(info.clienteId) ?? "—") : "—",
            visitas: visitasPorMaquina.get(id) ?? 0,
            ventas: v.ventas,
            neto: v.neto,
            costo: v.costo,
            utilidad: v.utilidad,
            margen_pct:
              v.neto > 0 ? Math.round((v.utilidad / v.neto) * 10000) / 100 : 0,
            gramos: v.gramos,
          };
        })
        .sort((a, b) => b.neto - a.neto),
      por_producto: Array.from(porProducto.entries())
        .map(([id, v]) => ({
          sku: prodInfo.get(id)?.sku ?? "—",
          nombre: prodInfo.get(id)?.nombre ?? "—",
          ventas: v.ventas,
          gramos: v.gramos,
          neto: v.neto,
          costo: v.costo,
          utilidad: v.utilidad,
        }))
        .sort((a, b) => b.utilidad - a.utilidad),
    },
    ventas_intercompany: {
      transacciones: vicArr.length,
      costo: vicArr.reduce((s, v) => s + Number(v.costo_total ?? 0), 0),
      venta: vicArr.reduce((s, v) => s + Number(v.precio_venta_neto ?? 0), 0),
      utilidad: vicArr.reduce((s, v) => s + Number(v.utilidad ?? 0), 0),
      por_empresa: Array.from(vicPorEmpresa.entries()).map(([id, v]) => ({
        empresa: vicEmpresaMap.get(id) ?? "—",
        ventas: v.ventas,
        costo: v.costo,
        venta: v.venta,
        utilidad: v.utilidad,
      })),
    },
    compras: {
      recepciones: recArr.length,
      monto_total: recArr.reduce(
        (s, r) => s + Number(r.valor_total ?? 0),
        0,
      ),
      por_proveedor: Array.from(recPorProv.entries()).map(([id, v]) => ({
        proveedor: provMap.get(id) ?? "—",
        recepciones: v.recepciones,
        monto: v.monto,
      })),
    },
    ajustes_mermas: Array.from(ajustesPorTipo.entries()).map(([tipo, v]) => ({
      tipo,
      movimientos: v.movimientos,
      cantidad_cartuchos: v.cantidad_cartuchos,
      cantidad_vasos: v.cantidad_vasos,
      gramos: v.gramos,
      valor: v.valor,
    })),
    inventario_fin: {
      almacen: {
        polvo_granel: {
          gramos: Number(invSnap?.almacen_granel_gramos ?? 0),
          valor: Number(invSnap?.almacen_granel_valor ?? 0),
        },
        polvo_cartuchos: {
          unidades: Number(invSnap?.almacen_cartuchos_unidades ?? 0),
          gramos: Number(invSnap?.almacen_cartuchos_gramos ?? 0),
          valor: Number(invSnap?.almacen_cartuchos_valor ?? 0),
        },
        vasos: {
          unidades: Number(invSnap?.almacen_vasos_unidades ?? 0),
          valor: Number(invSnap?.almacen_vasos_valor ?? 0),
        },
        subtotal: almacenSub,
      },
      maquinas: {
        polvo_tolvas: {
          gramos: Number(invSnap?.maquinas_polvo_gramos ?? 0),
          valor: Number(invSnap?.maquinas_polvo_valor ?? 0),
        },
        vasos: {
          unidades: Number(invSnap?.maquinas_vasos_unidades ?? 0),
          valor: Number(invSnap?.maquinas_vasos_valor ?? 0),
        },
        subtotal: maquinasSub,
        por_cliente: (invSnap?.por_cliente ?? []).map((c) => ({
          cliente: c.cliente,
          maquinas: Number(c.maquinas ?? 0),
          gramos_polvo: Number(c.gramos_polvo ?? 0),
          valor_polvo: Number(c.valor_polvo ?? 0),
          unidades_vasos: Number(c.unidades_vasos ?? 0),
          valor_vasos: Number(c.valor_vasos ?? 0),
          total: Number(c.total ?? 0),
        })),
      },
      total: almacenSub + maquinasSub,
    },
  };
}
