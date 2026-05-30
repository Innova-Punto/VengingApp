"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type AsigEstado = Database["public"]["Enums"]["asignacion_estado"];
type ExcMotivo = Database["public"]["Enums"]["excepcion_motivo"];

const ROLES = ["admin", "direccion", "planeador"] as const;

// ============================================================================
// Asignación
// ============================================================================

export type AsigResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

export async function crearAsignacion(
  _prev: AsigResult | null,
  formData: FormData,
): Promise<AsigResult> {
  const current = await requireRole(...ROLES);

  const fecha = String(formData.get("fecha") ?? "").trim();
  const ruta_id = String(formData.get("ruta_id") ?? "");
  const operador_id = String(formData.get("operador_id") ?? "");
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!fecha) return { ok: false, message: "Selecciona la fecha." };
  if (!ruta_id) return { ok: false, message: "Selecciona la ruta." };
  if (!operador_id)
    return { ok: false, message: "Selecciona el operador." };

  const supabase = createClient();

  const { data: asig, error } = await supabase
    .from("asignaciones_diarias")
    .insert({
      fecha,
      ruta_id,
      operador_id,
      notas,
      creado_por: current.id,
      estado: "planeada",
    })
    .select("id")
    .single();

  if (error || !asig) {
    if (error?.code === "23505") {
      return {
        ok: false,
        message: "Esa ruta ya tiene una asignación para esa fecha.",
      };
    }
    return { ok: false, message: error?.message ?? "Error" };
  }

  // Copiar las máquinas base de la ruta a la asignación
  const { data: rutaMaquinas } = await supabase
    .from("ruta_maquinas")
    .select("maquina_id, orden")
    .eq("ruta_id", ruta_id)
    .order("orden");

  if (rutaMaquinas && rutaMaquinas.length > 0) {
    const rows = rutaMaquinas.map((rm) => ({
      asignacion_id: asig.id,
      maquina_id: rm.maquina_id,
      orden: rm.orden,
      origen: "base_ruta" as const,
    }));
    const { error: insErr } = await supabase
      .from("asignacion_maquinas")
      .insert(rows);
    if (insErr) {
      return {
        ok: false,
        message: `Asignación creada pero al copiar máquinas: ${insErr.message}`,
      };
    }
  }

  revalidatePath("/planeacion/asignaciones");
  redirect(`/planeacion/asignaciones/${asig.id}`);
}

export async function actualizarNotasAsig(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const notas = String(formData.get("notas") ?? "").trim() || null;
  if (!id) redirect("/planeacion/asignaciones");
  const supabase = createClient();
  await supabase.from("asignaciones_diarias").update({ notas }).eq("id", id);
  revalidatePath(`/planeacion/asignaciones/${id}`);
  redirect(`/planeacion/asignaciones/${id}`);
}

export async function cambiarEstadoAsig(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "") as AsigEstado;
  if (!id) redirect("/planeacion/asignaciones");

  const validos: AsigEstado[] = [
    "planeada",
    "surtida",
    "en_jornada",
    "completada",
    "cancelada",
  ];
  if (!validos.includes(estado))
    redirect(`/planeacion/asignaciones/${id}`);

  const supabase = createClient();
  await supabase
    .from("asignaciones_diarias")
    .update({ estado })
    .eq("id", id);

  revalidatePath("/planeacion/asignaciones");
  revalidatePath(`/planeacion/asignaciones/${id}`);
  redirect(`/planeacion/asignaciones/${id}`);
}

// ============================================================================
// Máquinas dentro de la asignación
// ============================================================================

export type AsigMaqResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function agregarMaquinaExcepcion(
  _prev: AsigMaqResult | null,
  formData: FormData,
): Promise<AsigMaqResult> {
  await requireRole(...ROLES);

  const asignacion_id = String(formData.get("asignacion_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");
  const motivoRaw = String(formData.get("motivo_excepcion") ?? "");
  const notas = String(formData.get("notas") ?? "").trim() || null;
  const ordenRaw = formData.get("orden");

  if (!asignacion_id || !maquina_id) {
    return { ok: false, message: "Falta asignación o máquina." };
  }

  const motivosValidos: ExcMotivo[] = [
    "ausencia_operador",
    "emergencia",
    "mantenimiento",
    "otro",
  ];
  if (!motivosValidos.includes(motivoRaw as ExcMotivo)) {
    return { ok: false, message: "Motivo de excepción inválido." };
  }

  const orden = ordenRaw && String(ordenRaw).trim() !== ""
    ? Number(ordenRaw)
    : 99;

  const supabase = createClient();
  const { error } = await supabase.from("asignacion_maquinas").insert({
    asignacion_id,
    maquina_id,
    orden,
    origen: "agregada_excepcion",
    motivo_excepcion: motivoRaw as ExcMotivo,
    notas,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: "Esta máquina ya está en la asignación.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/planeacion/asignaciones/${asignacion_id}`);
  return { ok: true, message: "Máquina agregada." };
}

export async function quitarMaquinaDeAsig(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const asignacion_id = String(formData.get("asignacion_id") ?? "");
  if (!id || !asignacion_id) redirect("/planeacion/asignaciones");

  const supabase = createClient();
  await supabase.from("asignacion_maquinas").delete().eq("id", id);

  revalidatePath(`/planeacion/asignaciones/${asignacion_id}`);
  redirect(`/planeacion/asignaciones/${asignacion_id}`);
}
