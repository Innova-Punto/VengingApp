"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion", "planeador"] as const;

export type SustResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Programa la sustitución de producto en una o varias tolvas.
 * Planeación decide qué máquinas llevan cambio; el operador solo ejecuta.
 */
export async function programarSustituciones(input: {
  tolvaIds: string[];
  productoEntranteId: string;
  motivo: string | null;
}): Promise<SustResult> {
  await requireRole(...ROLES);

  const tolvas = (input.tolvaIds ?? []).filter(Boolean);
  if (tolvas.length === 0) {
    return { ok: false, message: "Selecciona al menos una máquina." };
  }
  if (!input.productoEntranteId) {
    return { ok: false, message: "Selecciona el producto entrante." };
  }

  const supabase = createClient();
  const errores: string[] = [];
  let ok = 0;

  for (const tolvaId of tolvas) {
    const { error } = await supabase.rpc("crear_sustitucion_tolva", {
      p_tolva_id: tolvaId,
      p_producto_entrante_id: input.productoEntranteId,
      p_motivo: input.motivo ?? undefined,
    });
    if (error) errores.push(error.message);
    else ok += 1;
  }

  revalidatePath("/planeacion/sustituciones");
  revalidatePath("/planeacion/asignaciones", "layout");

  if (ok === 0) {
    return { ok: false, message: errores[0] ?? "No se pudo programar." };
  }
  if (errores.length > 0) {
    return {
      ok: true,
      message: `${ok} sustitución(es) programada(s). ${errores.length} fallaron: ${errores[0]}`,
    };
  }
  return {
    ok: true,
    message: `${ok} sustitución(es) programada(s). El operador las verá como instrucción obligatoria en su próxima visita.`,
  };
}

export async function cancelarSustitucion(input: {
  id: string;
  motivo: string | null;
}): Promise<SustResult> {
  await requireRole(...ROLES);
  if (!input.id) return { ok: false, message: "Falta el id." };

  const supabase = createClient();
  const { error } = await supabase.rpc("cancelar_sustitucion_tolva", {
    p_id: input.id,
    p_motivo: input.motivo ?? undefined,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/planeacion/sustituciones");
  return { ok: true, message: "Sustitución cancelada." };
}
