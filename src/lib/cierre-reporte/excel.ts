// Convierte un snapshot de cierre en un workbook XLSX listo para descargar.
//
// Hojas:
//   1. Resumen P&L
//   2. Ventas detalle (omitida en v1; el dashboard expone las transacciones)
//   3. Ventas por cliente
//   4. Ventas por máquina (incluye visitas en el mes)
//   5. Ventas intercompany
//   6. Compras / Recepciones
//   7. Inventario al cierre (almacén / máquinas separados)
//   8. Mermas y ajustes

import ExcelJS from "exceljs";

import type { SnapshotCierre } from "./builder";

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

const MXN = '"$"#,##0.00;[Red]-"$"#,##0.00';
const PCT = "0.00%";
const INT = "#,##0";

function header(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF18181B" },
  };
  row.alignment = { vertical: "middle" };
}

function total(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE4E4E7" },
  };
}

export async function generarWorkbook(
  snapshot: SnapshotCierre,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MuscleUp";
  wb.created = new Date();

  const periodoLabel = `${MESES[snapshot.periodo.mes - 1]} ${snapshot.periodo.anio}`;

  // ===========================================================
  // 1. Resumen P&L
  // ===========================================================
  {
    const ws = wb.addWorksheet("1. Resumen P&L");
    ws.columns = [
      { header: "Concepto", key: "concepto", width: 38 },
      { header: "Monto MXN", key: "monto", width: 18 },
    ];
    header(ws.getRow(1));

    const v = snapshot.ventas_nayax;
    const ic = snapshot.ventas_intercompany;
    const totalMermas = snapshot.ajustes_mermas
      .filter((m) => m.valor < 0)
      .reduce((s, m) => s + m.valor, 0);
    const totalSobrantes = snapshot.ajustes_mermas
      .filter((m) => m.valor > 0)
      .reduce((s, m) => s + m.valor, 0);

    ws.addRow({ concepto: `Periodo: ${periodoLabel}`, monto: null });
    ws.addRow({});
    ws.addRow({ concepto: "INGRESOS NAYAX", monto: null }).font = {
      bold: true,
    };
    ws.addRow({ concepto: "  Ingresos brutos", monto: v.bruto });
    ws.addRow({ concepto: "  Comisión Nayax", monto: -v.comision });
    const rIngresoNeto = ws.addRow({
      concepto: "  Ingresos netos Nayax",
      monto: v.neto,
    });
    total(rIngresoNeto);

    ws.addRow({});
    ws.addRow({ concepto: "INGRESOS INTERCOMPANY", monto: ic.venta });
    ws.addRow({});

    ws.addRow({ concepto: "COSTOS DEL PERIODO", monto: null }).font = {
      bold: true,
    };
    ws.addRow({ concepto: "  Costo polvo (Nayax)", monto: -v.costo_polvo });
    ws.addRow({ concepto: "  Costo vaso (Nayax)", monto: -v.costo_vaso });
    ws.addRow({ concepto: "  Costo intercompany", monto: -ic.costo });

    ws.addRow({});
    ws.addRow({ concepto: "AJUSTES DE INVENTARIO", monto: null }).font = {
      bold: true,
    };
    ws.addRow({ concepto: "  Mermas y ajustes negativos", monto: totalMermas });
    ws.addRow({
      concepto: "  Sobrantes y ajustes positivos",
      monto: totalSobrantes,
    });

    ws.addRow({});
    const utilidadTotal =
      v.utilidad + ic.utilidad + totalMermas + totalSobrantes;
    const rUtil = ws.addRow({
      concepto: "UTILIDAD BRUTA DEL PERIODO",
      monto: utilidadTotal,
    });
    total(rUtil);

    ws.addRow({});
    ws.addRow({
      concepto: "Margen bruto (utilidad / ingreso neto Nayax)",
      monto: v.neto > 0 ? utilidadTotal / v.neto : 0,
    });

    ws.addRow({});
    ws.addRow({ concepto: "Transacciones Nayax", monto: v.transacciones });
    ws.addRow({ concepto: "Gramos dispensados", monto: v.gramos_dispensados });
    ws.addRow({ concepto: "Ticket promedio Nayax", monto: v.ticket_promedio });

    ws.getColumn("monto").numFmt = MXN;
    // El último renglón con margen muestra como %
    const margenRow = ws.getRow(ws.rowCount - 3);
    margenRow.getCell("monto").numFmt = PCT;
    // Transacciones y gramos como enteros
    ws.getRow(ws.rowCount - 2).getCell("monto").numFmt = INT;
    ws.getRow(ws.rowCount - 1).getCell("monto").numFmt = INT;
  }

  // ===========================================================
  // 3. Ventas por cliente
  // ===========================================================
  {
    const ws = wb.addWorksheet("3. Ventas por cliente");
    ws.columns = [
      { header: "Cliente", key: "cliente", width: 28 },
      { header: "Ventas", key: "ventas", width: 12 },
      { header: "Ingreso neto", key: "neto", width: 16 },
      { header: "Costo polvo", key: "costo_polvo", width: 16 },
      { header: "Costo vaso", key: "costo_vaso", width: 14 },
      { header: "Utilidad", key: "utilidad", width: 16 },
      { header: "Margen", key: "margen", width: 12 },
    ];
    header(ws.getRow(1));
    for (const r of snapshot.ventas_nayax.por_cliente) {
      ws.addRow({
        cliente: r.cliente,
        ventas: r.ventas,
        neto: r.neto,
        costo_polvo: r.costo_polvo,
        costo_vaso: r.costo_vaso,
        utilidad: r.utilidad,
        margen: r.margen_pct / 100,
      });
    }
    const v = snapshot.ventas_nayax;
    const rT = ws.addRow({
      cliente: "TOTAL",
      ventas: v.transacciones,
      neto: v.neto,
      costo_polvo: v.costo_polvo,
      costo_vaso: v.costo_vaso,
      utilidad: v.utilidad,
      margen: v.neto > 0 ? v.utilidad / v.neto : 0,
    });
    total(rT);
    ws.getColumn("ventas").numFmt = INT;
    ws.getColumn("neto").numFmt = MXN;
    ws.getColumn("costo_polvo").numFmt = MXN;
    ws.getColumn("costo_vaso").numFmt = MXN;
    ws.getColumn("utilidad").numFmt = MXN;
    ws.getColumn("margen").numFmt = PCT;
  }

  // ===========================================================
  // 4. Ventas por máquina (con visitas)
  // ===========================================================
  {
    const ws = wb.addWorksheet("4. Ventas por máquina");
    ws.columns = [
      { header: "Serie", key: "serie", width: 10 },
      { header: "Alias", key: "alias", width: 22 },
      { header: "Cliente", key: "cliente", width: 22 },
      { header: "Visitas", key: "visitas", width: 10 },
      { header: "Ventas", key: "ventas", width: 10 },
      { header: "Gramos", key: "gramos", width: 12 },
      { header: "Ingreso neto", key: "neto", width: 16 },
      { header: "Costo", key: "costo", width: 16 },
      { header: "Utilidad", key: "utilidad", width: 16 },
      { header: "Margen", key: "margen", width: 12 },
    ];
    header(ws.getRow(1));
    for (const r of snapshot.ventas_nayax.por_maquina) {
      ws.addRow({
        serie: r.serie,
        alias: r.alias,
        cliente: r.cliente,
        visitas: r.visitas,
        ventas: r.ventas,
        gramos: r.gramos,
        neto: r.neto,
        costo: r.costo,
        utilidad: r.utilidad,
        margen: r.margen_pct / 100,
      });
    }
    ws.getColumn("visitas").numFmt = INT;
    ws.getColumn("ventas").numFmt = INT;
    ws.getColumn("gramos").numFmt = INT;
    ws.getColumn("neto").numFmt = MXN;
    ws.getColumn("costo").numFmt = MXN;
    ws.getColumn("utilidad").numFmt = MXN;
    ws.getColumn("margen").numFmt = PCT;
  }

  // ===========================================================
  // 5. Ventas intercompany
  // ===========================================================
  {
    const ws = wb.addWorksheet("5. Ventas intercompany");
    ws.columns = [
      { header: "Empresa", key: "empresa", width: 28 },
      { header: "Ventas", key: "ventas", width: 12 },
      { header: "Costo", key: "costo", width: 16 },
      { header: "Venta neta", key: "venta", width: 16 },
      { header: "Utilidad", key: "utilidad", width: 16 },
    ];
    header(ws.getRow(1));
    for (const r of snapshot.ventas_intercompany.por_empresa) {
      ws.addRow({
        empresa: r.empresa,
        ventas: r.ventas,
        costo: r.costo,
        venta: r.venta,
        utilidad: r.utilidad,
      });
    }
    const ic = snapshot.ventas_intercompany;
    if (ic.por_empresa.length > 0) {
      const rT = ws.addRow({
        empresa: "TOTAL",
        ventas: ic.transacciones,
        costo: ic.costo,
        venta: ic.venta,
        utilidad: ic.utilidad,
      });
      total(rT);
    }
    ws.getColumn("ventas").numFmt = INT;
    ws.getColumn("costo").numFmt = MXN;
    ws.getColumn("venta").numFmt = MXN;
    ws.getColumn("utilidad").numFmt = MXN;
  }

  // ===========================================================
  // 6. Compras / Recepciones
  // ===========================================================
  {
    const ws = wb.addWorksheet("6. Compras");
    ws.columns = [
      { header: "Proveedor", key: "proveedor", width: 28 },
      { header: "Recepciones", key: "recepciones", width: 14 },
      { header: "Monto MXN", key: "monto", width: 18 },
    ];
    header(ws.getRow(1));
    for (const r of snapshot.compras.por_proveedor) {
      ws.addRow({
        proveedor: r.proveedor,
        recepciones: r.recepciones,
        monto: r.monto,
      });
    }
    if (snapshot.compras.por_proveedor.length > 0) {
      const rT = ws.addRow({
        proveedor: "TOTAL",
        recepciones: snapshot.compras.recepciones,
        monto: snapshot.compras.monto_total,
      });
      total(rT);
    }
    ws.getColumn("recepciones").numFmt = INT;
    ws.getColumn("monto").numFmt = MXN;
  }

  // ===========================================================
  // 7. Inventario al cierre (desglosado)
  // ===========================================================
  {
    const ws = wb.addWorksheet("7. Inventario al cierre");
    ws.columns = [
      { header: "Ubicación", key: "loc", width: 18 },
      { header: "Tipo", key: "tipo", width: 28 },
      { header: "Cantidad", key: "cant", width: 16 },
      { header: "Unidad", key: "unidad", width: 12 },
      { header: "Valor MXN", key: "valor", width: 18 },
    ];
    header(ws.getRow(1));
    const inv = snapshot.inventario_fin;

    ws.addRow({
      loc: "Almacén",
      tipo: "Polvo granel",
      cant: inv.almacen.polvo_granel.gramos,
      unidad: "g",
      valor: inv.almacen.polvo_granel.valor,
    });
    ws.addRow({
      loc: "Almacén",
      tipo: `Polvo en cartuchos (${inv.almacen.polvo_cartuchos.gramos.toLocaleString()} g equivalentes)`,
      cant: inv.almacen.polvo_cartuchos.unidades,
      unidad: "cartuchos",
      valor: inv.almacen.polvo_cartuchos.valor,
    });
    ws.addRow({
      loc: "Almacén",
      tipo: "Vasos",
      cant: inv.almacen.vasos.unidades,
      unidad: "vasos",
      valor: inv.almacen.vasos.valor,
    });
    const rSubAlm = ws.addRow({
      loc: "",
      tipo: "Subtotal almacén",
      cant: null,
      unidad: "",
      valor: inv.almacen.subtotal,
    });
    total(rSubAlm);

    ws.addRow({
      loc: "Máquinas",
      tipo: "Polvo en tolvas",
      cant: inv.maquinas.polvo_tolvas.gramos,
      unidad: "g",
      valor: inv.maquinas.polvo_tolvas.valor,
    });
    ws.addRow({
      loc: "Máquinas",
      tipo: "Vasos en máquinas",
      cant: inv.maquinas.vasos.unidades,
      unidad: "vasos",
      valor: inv.maquinas.vasos.valor,
    });
    const rSubMaq = ws.addRow({
      loc: "",
      tipo: "Subtotal máquinas",
      cant: null,
      unidad: "",
      valor: inv.maquinas.subtotal,
    });
    total(rSubMaq);

    const rTotal = ws.addRow({
      loc: "",
      tipo: "TOTAL CAPITAL DE TRABAJO",
      cant: null,
      unidad: "",
      valor: inv.total,
    });
    total(rTotal);
    rTotal.font = { bold: true, size: 12 };

    ws.addRow({});
    ws.addRow({}).getCell(1).value = "Desglose por cliente (inventario en máquinas)";
    ws.getRow(ws.rowCount).font = { bold: true };

    const rHeader = ws.addRow({
      loc: "Cliente",
      tipo: "Máquinas",
      cant: "Gramos polvo",
      unidad: "Vasos",
      valor: "Valor total",
    });
    header(rHeader);
    for (const c of inv.maquinas.por_cliente) {
      ws.addRow({
        loc: c.cliente,
        tipo: c.maquinas,
        cant: c.gramos_polvo,
        unidad: c.unidades_vasos,
        valor: c.total,
      });
    }

    ws.getColumn("cant").numFmt = INT;
    ws.getColumn("valor").numFmt = MXN;
  }

  // ===========================================================
  // 8. Mermas y ajustes
  // ===========================================================
  {
    const ws = wb.addWorksheet("8. Mermas y ajustes");
    ws.columns = [
      { header: "Tipo", key: "tipo", width: 30 },
      { header: "Movimientos", key: "movs", width: 14 },
      { header: "Δ Cartuchos", key: "cart", width: 14 },
      { header: "Δ Vasos", key: "vasos", width: 14 },
      { header: "Δ Gramos", key: "gramos", width: 14 },
      { header: "Valor MXN", key: "valor", width: 18 },
    ];
    header(ws.getRow(1));
    for (const r of snapshot.ajustes_mermas) {
      ws.addRow({
        tipo: r.tipo,
        movs: r.movimientos,
        cart: r.cantidad_cartuchos,
        vasos: r.cantidad_vasos,
        gramos: r.gramos,
        valor: r.valor,
      });
    }
    ws.getColumn("movs").numFmt = INT;
    ws.getColumn("cart").numFmt = INT;
    ws.getColumn("vasos").numFmt = INT;
    ws.getColumn("gramos").numFmt = INT;
    ws.getColumn("valor").numFmt = MXN;
  }

  return await wb.xlsx.writeBuffer();
}
