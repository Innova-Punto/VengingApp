"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type Result =
  | { ok: true; message: string; ventaId?: string }
  | { ok: false; message: string };

export async function registrarVentaIntercompany(
  _prev: Result | null,
  formData: FormData,
): Promise<Result> {
  await requireRole("admin", "direccion", "almacen");

  const empresaId = String(formData.get("empresa_destino_id") ?? "");
  const productoId = String(formData.get("producto_id") ?? "");
  const presentacion = String(formData.get("presentacion") ?? "") as
    | "granel"
    | "vaso";
  const cantidad = Number(formData.get("cantidad") ?? NaN);
  const margen = Number(formData.get("margen_porcentaje") ?? NaN);
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!empresaId) return { ok: false, message: "Falta empresa destino." };
  if (!productoId) return { ok: false, message: "Falta producto." };
  if (!["granel", "vaso"].includes(presentacion))
    return { ok: false, message: "Presentación inválida." };
  if (!Number.isInteger(cantidad) || cantidad <= 0)
    return { ok: false, message: "Cantidad debe ser entero > 0." };
  if (!Number.isFinite(margen) || margen < 0)
    return { ok: false, message: "Margen debe ser >= 0." };

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  const { data, error } = await supabaseAny.rpc("registrar_venta_intercompany", {
    p_empresa_destino_id: empresaId,
    p_producto_id: productoId,
    p_presentacion: presentacion,
    p_cantidad: cantidad,
    p_margen_porcentaje: margen,
    p_notas: notas,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/ventas-intercompany");
  redirect("/admin/ventas-intercompany");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return { ok: true, message: "Venta registrada.", ventaId: data as string };
}
