// Endpoint de preview de costo PEPS para venta intercompany (read-only).
// Devuelve costo_total, disponible y suficiente para la cantidad pedida.

import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  await requireRole("admin", "direccion", "almacen");
  const { searchParams } = new URL(req.url);
  const productoId = searchParams.get("producto_id") ?? "";
  const presentacion = searchParams.get("presentacion") ?? "granel";
  const cantidad = Number(searchParams.get("cantidad") ?? 0);

  if (!productoId || !["granel", "vaso"].includes(presentacion) || cantidad <= 0) {
    return NextResponse.json({ costo_total: 0, disponible: 0, suficiente: false });
  }

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "preview_costo_intercompany",
    {
      p_producto_id: productoId,
      p_presentacion: presentacion,
      p_cantidad: Math.trunc(cantidad),
    },
  );
  if (error) {
    return NextResponse.json(
      { costo_total: 0, disponible: 0, suficiente: false, error: error.message },
      { status: 200 },
    );
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
