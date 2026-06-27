"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion", "almacen"] as const;

export type EmgResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

// Crea una asignación de emergencia (vacía, sin ruta base).
export async function crearEmergencia(
  _prev: EmgResult | null,
  formData: FormData,
): Promise<EmgResult> {
  await requireRole(...ROLES);

  const operador_id = String(formData.get("operador_id") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!operador_id) return { ok: false, message: "Selecciona el operador." };
  if (!fecha) return { ok: false, message: "Selecciona la fecha." };

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("crear_asignacion_emergencia", {
    p_operador_id: operador_id,
    p_fecha: fecha,
    p_notas: notas,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/planeacion/emergencias");
  return { ok: true, message: "Emergencia creada." };
}

// Agrega una máquina a una asignación (emergencia o ruta activa), con surtido
// por PEPS (modo 'surtir') o solo para visita/diagnóstico (modo 'visita').
export async function agregarMaquinaEmergencia(
  _prev: EmgResult | null,
  formData: FormData,
): Promise<EmgResult> {
  await requireRole(...ROLES);

  const asignacion_id = String(formData.get("asignacion_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");
  const modo = String(formData.get("modo") ?? "visita");
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!asignacion_id || !maquina_id) {
    return { ok: false, message: "Falta asignación o máquina." };
  }
  if (!["surtir", "visita"].includes(modo)) {
    return { ok: false, message: "Modo inválido." };
  }

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc(
    "agregar_maquina_excepcion_surtir",
    {
      p_asignacion_id: asignacion_id,
      p_maquina_id: maquina_id,
      p_modo: modo,
      p_motivo: "emergencia",
      p_notas: notas,
    },
  );
  if (error) return { ok: false, message: error.message };

  revalidatePath("/planeacion/emergencias");
  revalidatePath(`/planeacion/asignaciones/${asignacion_id}`);
  revalidatePath("/almacen/inventario");
  return {
    ok: true,
    message:
      modo === "surtir"
        ? "Máquina agregada y surtida (cartuchos descontados por PEPS)."
        : "Máquina agregada para visita / diagnóstico (sin cartuchos).",
  };
}
