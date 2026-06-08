"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  type EstadoValue,
  ESTADOS,
  MOTIVOS,
  type MotivoValue,
} from "@/lib/errores-operativos";
import { createClient } from "@/lib/supabase/server";

const MOTIVO_SET = new Set<string>(MOTIVOS.map((m) => m.value));
const ESTADO_SET = new Set<string>(ESTADOS.map((e) => e.value));

export async function crearErrorOperativo(formData: FormData) {
  const user = await requireRole("admin", "direccion");
  const supabase = createClient();

  const motivo = String(formData.get("motivo") ?? "");
  const operador_id = String(formData.get("operador_id") ?? "");
  if (!MOTIVO_SET.has(motivo)) return { error: "Motivo inválido" };
  if (!operador_id) return { error: "Operador requerido" };

  const payload: {
    motivo: MotivoValue;
    operador_id: string;
    levantado_por: string;
    descripcion: string | null;
    ruta_id: string | null;
    asignacion_id: string | null;
    maquina_id: string | null;
  } = {
    motivo: motivo as MotivoValue,
    operador_id,
    levantado_por: user.id,
    descripcion: (String(formData.get("descripcion") ?? "").trim() || null) as
      | string
      | null,
    ruta_id: (String(formData.get("ruta_id") ?? "") || null) as string | null,
    asignacion_id: (String(formData.get("asignacion_id") ?? "") || null) as
      | string
      | null,
    maquina_id: (String(formData.get("maquina_id") ?? "") || null) as
      | string
      | null,
  };

  const { error } = await supabase.from("errores_operativos").insert(payload);
  if (error) return { error: error.message };

  revalidatePath("/admin/errores-operativos");
  revalidatePath("/admin/jornadas/[id]", "page");
  return { ok: true };
}

export async function cambiarEstadoErrorOperativo(formData: FormData) {
  const user = await requireRole("admin", "direccion");
  const supabase = createClient();

  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "");
  const nota = String(formData.get("nota_resolucion") ?? "").trim() || null;
  if (!id) return { error: "id requerido" };
  if (!ESTADO_SET.has(estado)) return { error: "Estado inválido" };

  const upd: {
    estado: EstadoValue;
    nota_resolucion: string | null;
    resuelto_por: string | null;
    resuelto_at: string | null;
  } = {
    estado: estado as EstadoValue,
    nota_resolucion: nota,
    resuelto_por: estado === "abierto" ? null : user.id,
    resuelto_at: estado === "abierto" ? null : new Date().toISOString(),
  };

  const { error } = await supabase
    .from("errores_operativos")
    .update(upd)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/errores-operativos");
  return { ok: true };
}
