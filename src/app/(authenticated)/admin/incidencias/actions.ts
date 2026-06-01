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
  const user = await requireRole("admin", "direccion", "planeador");
  void user;

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id." };

  const estadoRaw = String(formData.get("estado") ?? "");
  const notasResolucion =
    String(formData.get("notas_resolucion") ?? "").trim() || null;
  const autorizar = formData.get("autorizar_merma") === "1";

  const productoAfectadoIdRaw =
    String(formData.get("producto_afectado_id") ?? "").trim() || null;
  const encartuchadoAfectadoIdRaw =
    String(formData.get("encartuchado_afectado_id") ?? "").trim() || null;
  const cartuchosAfectadosRaw = formData.get("cartuchos_afectados");
  let cartuchosAfectados: number | null = null;
  if (cartuchosAfectadosRaw !== null && cartuchosAfectadosRaw !== "") {
    const n = Number(cartuchosAfectadosRaw);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, message: "Cartuchos afectados debe ser entero ≥ 0." };
    }
    cartuchosAfectados = n;
  }

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  // Aplicar campos de inventario afectado primero (antes de autorizar)
  // para que el RPC de autorización los pueda leer.
  const updateInv: Record<string, unknown> = {
    producto_afectado_id: productoAfectadoIdRaw,
    encartuchado_afectado_id: encartuchadoAfectadoIdRaw,
    cartuchos_afectados: cartuchosAfectados,
  };
  const { error: invErr } = await (supabase.from("incidencias") as never as {
    update: (v: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  })
    .update(updateInv)
    .eq("id", id);
  if (invErr) return { ok: false, message: invErr.message };

  // Autorización de merma vía RPC (descuenta inventario si aplica)
  if (autorizar) {
    const cerrar = estadoRaw === "resuelta" || estadoRaw === "descartada";
    const { error } = await supabaseAny.rpc("autorizar_merma_incidencia", {
      p_incidencia_id: id,
      p_notas_resolucion: notasResolucion,
      p_cerrar: cerrar,
    });
    if (error) return { ok: false, message: error.message };

    // Si el RPC no cerró (estado intermedio), aplica estado restante
    if (
      estadoRaw &&
      !cerrar &&
      (estadoRaw === "abierta" || estadoRaw === "en_revision")
    ) {
      const { error: e2 } = await (supabase.from("incidencias") as never as {
        update: (v: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      })
        .update({ estado: estadoRaw })
        .eq("id", id);
      if (e2) return { ok: false, message: e2.message };
    }

    revalidatePath("/admin/incidencias");
    revalidatePath(`/admin/incidencias/${id}`);
    revalidatePath("/admin/dashboard");
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

  if (Object.keys(update).length > 0) {
    const { error } = await (supabase.from("incidencias") as never as {
      update: (v: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    })
      .update(update)
      .eq("id", id);
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin/incidencias");
  revalidatePath(`/admin/incidencias/${id}`);
  return { ok: true, message: "Incidencia actualizada." };
}
