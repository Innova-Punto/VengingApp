// Genera el XLSX del cierre on-demand y lo descarga.
// También guarda el snapshot en cierres_mensuales.snapshot.

import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { construirSnapshotCierre } from "@/lib/cierre-reporte/builder";
import { generarWorkbook } from "@/lib/cierre-reporte/excel";
import { createClient } from "@/lib/supabase/server";

const MESES_FILE = [
  "01-enero",
  "02-febrero",
  "03-marzo",
  "04-abril",
  "05-mayo",
  "06-junio",
  "07-julio",
  "08-agosto",
  "09-septiembre",
  "10-octubre",
  "11-noviembre",
  "12-diciembre",
];

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const { searchParams } = new URL(req.url);
  const clienteId = searchParams.get("cliente") || null;

  const snapshot = await construirSnapshotCierre(supabase, params.id, clienteId);

  // Solo el reporte GLOBAL persiste el snapshot en BD (el por-cliente es ad-hoc).
  if (!clienteId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("cierres_mensuales")
      .update({
        snapshot,
        reporte_generado_at: new Date().toISOString(),
      })
      .eq("id", params.id);
  }

  // Nombre del cliente para el archivo (si aplica)
  let sufijoCliente = "";
  if (clienteId) {
    const { data: cli } = await supabase
      .from("clientes")
      .select("nombre")
      .eq("id", clienteId)
      .maybeSingle();
    if (cli?.nombre) {
      sufijoCliente =
        "-" + cli.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    }
  }

  const buffer = await generarWorkbook(snapshot);
  const filename = `cierre-${snapshot.periodo.anio}-${MESES_FILE[snapshot.periodo.mes - 1]}${sufijoCliente}.xlsx`;

  return new NextResponse(buffer as unknown as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
