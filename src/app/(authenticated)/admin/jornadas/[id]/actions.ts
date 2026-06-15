"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function reabrirRuta(formData: FormData) {
  await requireRole("admin", "direccion", "planeador");
  const supabase = createClient();

  const asignacion_id = String(formData.get("asignacion_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  const jornada_id = String(formData.get("jornada_id") ?? "");

  if (!asignacion_id) return { error: "asignacion_id requerido" };
  if (motivo.length < 3)
    return { error: "El motivo debe tener al menos 3 caracteres" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("reabrir_ruta", {
    p_asignacion_id: asignacion_id,
    p_motivo: motivo,
  });

  if (error) return { error: error.message };

  if (jornada_id) revalidatePath(`/admin/jornadas/${jornada_id}`);
  revalidatePath("/admin/jornadas");
  revalidatePath("/admin/supervision");
  return { ok: true };
}
