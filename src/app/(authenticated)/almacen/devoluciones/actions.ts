"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function recibirDevolucion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin", "direccion", "almacen");

  const id = String(formData.get("id") ?? "");
  const cantidadRaw = formData.get("cantidad_recibida");
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!id) return { ok: false, message: "Falta el id de la devolución." };
  const cantidad = Number(cantidadRaw ?? -1);
  if (!Number.isInteger(cantidad) || cantidad < 0) {
    return { ok: false, message: "Cantidad recibida debe ser entero ≥ 0." };
  }

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  const { error } = await supabaseAny.rpc("recibir_devolucion", {
    p_devolucion_id: id,
    p_cantidad_recibida: cantidad,
    p_notas: notas,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/almacen/devoluciones");
  return { ok: true, message: "Devolución registrada." };
}
