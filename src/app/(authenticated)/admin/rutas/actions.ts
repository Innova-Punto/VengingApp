"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion", "planeador"] as const;

// ============================================================================
// Ruta
// ============================================================================

export type RutaResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

type ParsedRuta = {
  nombre: string;
  descripcion: string | null;
  operador_titular_id: string | null;
  color_hex: string | null;
};

function parseRuta(formData: FormData): ParsedRuta | string {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion =
    String(formData.get("descripcion") ?? "").trim() || null;
  const operador_titular_id =
    String(formData.get("operador_titular_id") ?? "").trim() || null;
  const color_hex =
    String(formData.get("color_hex") ?? "").trim() || null;

  if (!nombre) return "Nombre es obligatorio.";

  if (color_hex && !/^#[0-9A-Fa-f]{6}$/.test(color_hex)) {
    return "Color debe ser un hex válido (ej. #2563eb).";
  }

  return { nombre, descripcion, operador_titular_id, color_hex };
}

export async function crearRuta(
  _prev: RutaResult | null,
  formData: FormData,
): Promise<RutaResult> {
  await requireRole(...ROLES);
  const parsed = parseRuta(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("rutas")
    .insert(parsed)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: `Ya existe una ruta con el nombre "${parsed.nombre}".`,
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/rutas");
  redirect(`/admin/rutas/${data.id}`);
}

export async function actualizarRuta(
  _prev: RutaResult | null,
  formData: FormData,
): Promise<RutaResult> {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id." };

  const parsed = parseRuta(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { error } = await supabase.from("rutas").update(parsed).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: `Ya existe una ruta con el nombre "${parsed.nombre}".`,
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/rutas");
  revalidatePath(`/admin/rutas/${id}`);
  return { ok: true, message: "Cambios guardados.", id };
}

export async function toggleActivaRuta(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const activa = formData.get("activa") === "true";
  if (!id) redirect("/admin/rutas");
  const supabase = createClient();
  await supabase.from("rutas").update({ activa }).eq("id", id);
  revalidatePath("/admin/rutas");
  redirect("/admin/rutas");
}

// ============================================================================
// Máquinas dentro de la ruta
// ============================================================================

export type RutaMaquinaResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function agregarMaquinaARuta(
  _prev: RutaMaquinaResult | null,
  formData: FormData,
): Promise<RutaMaquinaResult> {
  await requireRole(...ROLES);

  const ruta_id = String(formData.get("ruta_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");
  const ordenRaw = formData.get("orden");

  if (!ruta_id || !maquina_id) {
    return { ok: false, message: "Falta ruta o máquina." };
  }

  const orden = ordenRaw && String(ordenRaw).trim() !== ""
    ? Number(ordenRaw)
    : 0;
  if (!Number.isInteger(orden) || orden < 0) {
    return { ok: false, message: "Orden debe ser un entero ≥ 0." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("ruta_maquinas")
    .insert({ ruta_id, maquina_id, orden });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message:
          "Esa máquina ya está asignada a alguna ruta. Quítala de la otra primero.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/admin/rutas/${ruta_id}`);
  return { ok: true, message: "Máquina agregada." };
}

export async function quitarMaquinaDeRuta(formData: FormData) {
  await requireRole(...ROLES);
  const ruta_id = String(formData.get("ruta_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");
  if (!ruta_id || !maquina_id) redirect("/admin/rutas");

  const supabase = createClient();
  await supabase
    .from("ruta_maquinas")
    .delete()
    .eq("ruta_id", ruta_id)
    .eq("maquina_id", maquina_id);

  revalidatePath(`/admin/rutas/${ruta_id}`);
  redirect(`/admin/rutas/${ruta_id}`);
}

export async function actualizarOrdenMaquina(formData: FormData) {
  await requireRole(...ROLES);
  const ruta_id = String(formData.get("ruta_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");
  const ordenRaw = formData.get("orden");
  if (!ruta_id || !maquina_id) redirect("/admin/rutas");

  const orden = Number(ordenRaw);
  if (!Number.isInteger(orden) || orden < 0) {
    redirect(`/admin/rutas/${ruta_id}`);
  }

  const supabase = createClient();
  await supabase
    .from("ruta_maquinas")
    .update({ orden })
    .eq("ruta_id", ruta_id)
    .eq("maquina_id", maquina_id);

  revalidatePath(`/admin/rutas/${ruta_id}`);
  redirect(`/admin/rutas/${ruta_id}`);
}
