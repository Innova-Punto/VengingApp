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

  void user;
  const supabase = createClient();

  // Autorizar merma va vía RPC porque descuenta inventario y registra kardex.
  if (autorizar) {
    const cerrar =
      estadoRaw === "resuelta" || estadoRaw === "descartada";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;
    const { error } = await supabaseAny.rpc("autorizar_merma_incidencia", {
      p_incidencia_id: id,
      p_notas_resolucion: notasResolucion,
      p_cerrar: cerrar,
    });
    if (error) return { ok: false, message: error.message };

    // Si pidieron estado distinto del que aplicó el RPC (no se autocierra), aplica el resto
    if (
      estadoRaw &&
      !cerrar &&
      (estadoRaw === "abierta" || estadoRaw === "en_revision")
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e2 } = await (supabase.from("incidencias") as any)
        .update({ estado: estadoRaw })
        .eq("id", id);
      if (e2) return { ok: false, message: e2.message };
    }

    revalidatePath("/admin/incidencias");
    revalidatePath(`/admin/incidencias/${id}`);
    return { ok: true, message: "Merma autorizada." };
  }

  // Update simple (estado + notas)
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
