"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function editarPesajeItem(formData: FormData) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const itemId = String(formData.get("item_id") ?? "");
  const nuevosGramos = Number(formData.get("gramos_medidos") ?? NaN);
  const motivo = String(formData.get("motivo") ?? "").trim() || undefined;

  if (!itemId) return { error: "item_id requerido" };
  if (!Number.isFinite(nuevosGramos) || nuevosGramos < 0) {
    return { error: "gramos_medidos debe ser un entero >= 0" };
  }

  const { error } = await supabase.rpc("editar_pesaje_tolva_item", {
    p_item_id: itemId,
    p_nuevos_gramos: Math.round(nuevosGramos),
    p_motivo: motivo,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/pesajes/[id]", "page");
  revalidatePath("/admin/jornadas/[id]", "page");
  return { ok: true };
}

export async function editarPesajeVasos(formData: FormData) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const pesajeId = String(formData.get("pesaje_id") ?? "");
  const nuevosVasos = Number(formData.get("vasos_medidos") ?? NaN);
  const motivo = String(formData.get("motivo") ?? "").trim() || undefined;

  if (!pesajeId) return { error: "pesaje_id requerido" };
  if (!Number.isFinite(nuevosVasos) || nuevosVasos < 0) {
    return { error: "vasos_medidos debe ser un entero >= 0" };
  }

  const { error } = await supabase.rpc("editar_pesaje_vasos", {
    p_pesaje_id: pesajeId,
    p_nuevos_vasos: Math.round(nuevosVasos),
    p_motivo: motivo,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/pesajes/[id]", "page");
  revalidatePath("/admin/jornadas/[id]", "page");
  return { ok: true };
}
