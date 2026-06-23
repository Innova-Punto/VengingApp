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
  _req: Request,
  { params }: { params: { id: string } },
) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const snapshot = await construirSnapshotCierre(supabase, params.id);

  // Guarda el snapshot en BD como respaldo (idempotente — se sobreescribe en cada regeneración)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("cierres_mensuales")
    .update({
      snapshot,
      reporte_generado_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  const buffer = await generarWorkbook(snapshot);
  const filename = `cierre-${snapshot.periodo.anio}-${MESES_FILE[snapshot.periodo.mes - 1]}.xlsx`;

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
