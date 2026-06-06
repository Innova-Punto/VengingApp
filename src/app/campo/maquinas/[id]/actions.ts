"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

async function subirFoto(
  supabase: AnyClient,
  bucket: string,
  path: string,
  foto: File,
): Promise<string | null> {
  const buf = Buffer.from(await foto.arrayBuffer());
  const ext = (foto.name.split(".").pop() ?? "jpg").toLowerCase();
  const fullPath = `${path}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(fullPath, buf, {
    contentType: foto.type || "image/jpeg",
    upsert: true,
  });
  if (error) {
    throw new Error(`Error subiendo foto: ${error.message}`);
  }
  return `${bucket}/${fullPath}`;
}

// ============================================================================
// Check-in
// ============================================================================

export async function hacerCheckIn(formData: FormData): Promise<ActionResult> {
  await requireRole("operador", "admin", "direccion");

  const asignacion_id = String(formData.get("asignacion_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");
  if (!asignacion_id || !maquina_id) {
    return { ok: false, message: "Faltan datos del check-in." };
  }

  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const precRaw = formData.get("precision_m");
  const notas = String(formData.get("notas") ?? "") || null;
  const foto = formData.get("foto");

  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;
  const precision_m = precRaw ? Number(precRaw) : null;
  const metodo = lat !== null && lng !== null ? "gps" : "manual_supervisado";

  const supabase = createClient() as AnyClient;

  let foto_url: string | null = null;
  if (foto instanceof File && foto.size > 0) {
    try {
      foto_url = await subirFoto(
        supabase,
        "evidencias-checkin",
        `${asignacion_id}/${maquina_id}-${Date.now()}`,
        foto,
      );
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  const { error } = await supabase.rpc("op_check_in", {
    p_asignacion_id: asignacion_id,
    p_maquina_id: maquina_id,
    p_metodo: metodo,
    p_lat: lat,
    p_lng: lng,
    p_precision_m: precision_m,
    p_foto_url: foto_url,
    p_notas: notas,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/campo/maquinas/${maquina_id}`);
  revalidatePath(`/campo/jornada/${asignacion_id}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/jornadas", "layout");
  return { ok: true, message: "Check-in registrado." };
}

// ============================================================================
// Registrar llenado (cierra la visita)
// ============================================================================

export async function registrarLlenado(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("operador", "admin", "direccion");

  const check_in_id = String(formData.get("check_in_id") ?? "");
  const asignacion_id = String(formData.get("asignacion_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");
  const itemsRaw = String(formData.get("items") ?? "[]");
  const notas = String(formData.get("notas") ?? "") || null;
  const vasosCargadosRaw = formData.get("vasos_cargados");
  const vasos_cargados = vasosCargadosRaw
    ? Math.max(0, Number(vasosCargadosRaw) || 0)
    : 0;
  const foto = formData.get("foto");
  const fotoSalida = formData.get("foto_salida");
  const checkoutNayaxOk = formData.get("checkout_nayax_ok");
  const checkoutMaquinaLimpia = formData.get("checkout_maquina_limpia");
  const checkoutProductosOk = formData.get("checkout_productos_ok");

  if (!check_in_id) return { ok: false, message: "Falta check-in." };

  // Validación: foto de salida obligatoria
  if (!(fotoSalida instanceof File) || fotoSalida.size === 0) {
    return { ok: false, message: "La foto de salida es obligatoria." };
  }
  // Validación: checklist completo
  if (
    !["true", "false"].includes(String(checkoutNayaxOk)) ||
    !["true", "false"].includes(String(checkoutMaquinaLimpia)) ||
    !["true", "false"].includes(String(checkoutProductosOk))
  ) {
    return { ok: false, message: "Completa los 3 puntos del checklist de salida." };
  }

  let items: unknown;
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { ok: false, message: "Items inválidos." };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, message: "Debes indicar al menos un ítem." };
  }

  const supabase = createClient() as AnyClient;

  let foto_url: string | null = null;
  if (foto instanceof File && foto.size > 0) {
    try {
      foto_url = await subirFoto(
        supabase,
        "evidencias-llenado",
        `${asignacion_id}/${maquina_id}-llenado-${Date.now()}`,
        foto,
      );
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  let foto_salida_url: string | null = null;
  try {
    foto_salida_url = await subirFoto(
      supabase,
      "evidencias-checkin",
      `${asignacion_id}/${maquina_id}-salida-${Date.now()}`,
      fotoSalida as File,
    );
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  const { error } = await supabase.rpc("op_registrar_llenado", {
    p_check_in_id: check_in_id,
    p_items: items,
    p_evidencia_url: foto_url,
    p_notas: notas,
    p_vasos_cargados: vasos_cargados,
    p_foto_salida_url: foto_salida_url,
    p_checkout_nayax_ok: checkoutNayaxOk === "true",
    p_checkout_maquina_limpia: checkoutMaquinaLimpia === "true",
    p_checkout_productos_ok: checkoutProductosOk === "true",
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/campo/maquinas/${maquina_id}`);
  revalidatePath(`/campo/jornada/${asignacion_id}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/cierres", "layout");
  revalidatePath("/admin/jornadas", "layout");
  revalidatePath("/almacen/devoluciones");
  return { ok: true, message: "Visita completada." };
}

// ============================================================================
// Cerrar visita sin llenado (cuando no hay surtido planeado en la máquina)
// ============================================================================

export async function cerrarVisitaSinLlenado(input: {
  checkInId: string;
  asignacionId: string;
  maquinaId: string;
  notas: string | null;
  fotoSalida: File | null;
  checkoutNayaxOk: boolean | null;
  checkoutMaquinaLimpia: boolean | null;
  checkoutProductosOk: boolean | null;
}): Promise<ActionResult> {
  await requireRole("operador", "admin", "direccion");

  if (!input.checkInId) return { ok: false, message: "Falta check-in." };

  if (!input.fotoSalida || input.fotoSalida.size === 0) {
    return { ok: false, message: "La foto de salida es obligatoria." };
  }
  if (
    input.checkoutNayaxOk === null ||
    input.checkoutMaquinaLimpia === null ||
    input.checkoutProductosOk === null
  ) {
    return { ok: false, message: "Completa los 3 puntos del checklist de salida." };
  }

  const supabase = createClient() as AnyClient;

  let foto_salida_url: string | null = null;
  try {
    foto_salida_url = await subirFoto(
      supabase,
      "evidencias-checkin",
      `${input.asignacionId}/${input.maquinaId}-salida-${Date.now()}`,
      input.fotoSalida,
    );
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  const { error } = await supabase.rpc("op_cerrar_check_in_sin_llenado", {
    p_check_in_id: input.checkInId,
    p_notas: input.notas,
    p_foto_salida_url: foto_salida_url,
    p_checkout_nayax_ok: input.checkoutNayaxOk,
    p_checkout_maquina_limpia: input.checkoutMaquinaLimpia,
    p_checkout_productos_ok: input.checkoutProductosOk,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/campo/maquinas/${input.maquinaId}`);
  revalidatePath(`/campo/jornada/${input.asignacionId}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/jornadas", "layout");
  return { ok: true, message: "Visita cerrada." };
}

// ============================================================================
// Pesaje de tolvas en máquina (requiere cierre mensual abierto)
// ============================================================================

export async function registrarPesaje(input: {
  checkInId: string;
  asignacionId: string;
  maquinaId: string;
  items: { tolva_id: string; gramos_medidos: number }[];
  notas: string | null;
}): Promise<ActionResult> {
  await requireRole("operador", "admin", "direccion");

  if (!input.checkInId) return { ok: false, message: "Falta check-in." };
  if (!input.items || input.items.length === 0) {
    return { ok: false, message: "Sin ítems para pesar." };
  }

  const supabase = createClient() as AnyClient;

  const { error } = await supabase.rpc("op_registrar_pesaje_maquina", {
    p_check_in_id: input.checkInId,
    p_items: input.items,
    p_notas: input.notas,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/campo/maquinas/${input.maquinaId}`);
  revalidatePath(`/campo/jornada/${input.asignacionId}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/cierres", "layout");
  return { ok: true, message: "Pesaje registrado." };
}

// ============================================================================
// Reportar incidencia (insert directo, RLS permite al operador)
// ============================================================================

export async function reportarIncidencia(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole("operador", "admin", "direccion");

  const check_in_id = String(formData.get("check_in_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");
  const asignacion_id = String(formData.get("asignacion_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const severidad = String(formData.get("severidad") ?? "media");
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const foto = formData.get("foto");

  if (!check_in_id || !maquina_id || !tipo || !descripcion) {
    return { ok: false, message: "Datos incompletos." };
  }

  const supabase = createClient() as AnyClient;

  let foto_url: string | null = null;
  if (foto instanceof File && foto.size > 0) {
    try {
      foto_url = await subirFoto(
        supabase,
        "evidencias-incidencias",
        `${asignacion_id}/${maquina_id}-${Date.now()}`,
        foto,
      );
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  const { error } = await supabase.from("incidencias").insert({
    tipo,
    severidad,
    maquina_id,
    operador_id: user.id,
    check_in_id,
    descripcion,
    foto_url,
    folio: "", // generado por trigger trg_incidencia_folio
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/campo/maquinas/${maquina_id}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/incidencias", "layout");
  return { ok: true, message: "Incidencia reportada." };
}
