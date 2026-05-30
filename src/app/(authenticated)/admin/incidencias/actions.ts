"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type EstadoIncidencia = "abierta" | "en_revision" | "resuelta" | "descartada";

export async function actualizarIncidencia(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole("admin", "direccion");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id." };

  const estadoRaw = String(formData.get("estado") ?? "");
  const notasResolucion =
    String(formData.get("notas_resolucion") ?? "").trim() || null;
  const autorizar = formData.get("autorizar_merma") === "1";

  const estadosValidos: EstadoIncidencia[] = [
    "abierta",
    "en_revision",
    "resuelta",
    "descartada",
  ];
  if (estadoRaw && !estadosValidos.includes(estadoRaw as EstadoIncidencia)) {
    return { ok: false, message: "Estado inválido." };
  }

  const supabase = createClient();

  const update: Record<string, unknown> = {};
  if (estadoRaw) {
    update.estado = estadoRaw;
    if (estadoRaw === "resuelta" || estadoRaw === "descartada") {
      update.fecha_cierre = new Date().toISOString();
    }
  }
  if (notasResolucion !== null) {
    update.notas_resolucion = notasResolucion;
  }
  if (autorizar) {
    update.autorizada_por = user.id;
    update.fecha_autorizacion = new Date().toISOString();
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, message: "Nada para actualizar." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("incidencias") as any)
    .update(update)
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/incidencias");
  revalidatePath(`/admin/incidencias/${id}`);
  return { ok: true, message: "Incidencia actualizada." };
}
