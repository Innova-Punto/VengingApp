"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion"] as const;

// ============================================================================
// Cliente
// ============================================================================

export type ClienteResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

type ParsedCliente = {
  nombre: string;
  razon_social: string | null;
  rfc: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_tel: string | null;
  emails_reporte: string[] | null;
  notas: string | null;
};

function parseCliente(formData: FormData): ParsedCliente | string {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const razon_social =
    String(formData.get("razon_social") ?? "").trim() || null;
  const rfc =
    String(formData.get("rfc") ?? "").trim().toUpperCase() || null;
  const contacto_nombre =
    String(formData.get("contacto_nombre") ?? "").trim() || null;
  const contacto_email =
    String(formData.get("contacto_email") ?? "").trim().toLowerCase() || null;
  const contacto_tel =
    String(formData.get("contacto_tel") ?? "").trim() || null;
  const emailsReporteRaw = String(formData.get("emails_reporte") ?? "");
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!nombre) return "Nombre es obligatorio.";
  if (
    contacto_email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto_email)
  ) {
    return "Email de contacto inválido.";
  }

  let emails_reporte: string[] | null = null;
  if (emailsReporteRaw.trim()) {
    const list = emailsReporteRaw
      .split(/[\n,;]/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
    const invalid = list.filter(
      (e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
    );
    if (invalid.length > 0) {
      return `Email(s) inválido(s) en lista de reporte: ${invalid.join(", ")}`;
    }
    emails_reporte = list.length > 0 ? list : null;
  }

  return {
    nombre,
    razon_social,
    rfc,
    contacto_nombre,
    contacto_email,
    contacto_tel,
    emails_reporte,
    notas,
  };
}

export async function crearCliente(
  _prev: ClienteResult | null,
  formData: FormData,
): Promise<ClienteResult> {
  await requireRole(...ROLES);
  const parsed = parseCliente(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("clientes")
    .insert(parsed)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: `Ya existe un cliente con el nombre "${parsed.nombre}".`,
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/clientes");
  redirect(`/admin/clientes/${data.id}`);
}

export async function actualizarCliente(
  _prev: ClienteResult | null,
  formData: FormData,
): Promise<ClienteResult> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id del cliente." };

  const parsed = parseCliente(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { error } = await supabase
    .from("clientes")
    .update(parsed)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: `Ya existe un cliente con el nombre "${parsed.nombre}".`,
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${id}`);
  return { ok: true, message: "Cambios guardados.", id };
}

export async function toggleActivoCliente(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "true";
  if (!id) redirect("/admin/clientes");

  const supabase = createClient();
  await supabase.from("clientes").update({ activo }).eq("id", id);

  revalidatePath("/admin/clientes");
  redirect("/admin/clientes");
}

// ============================================================================
// Ubicaciones
// ============================================================================

export type UbicacionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

type ParsedUbicacion = {
  cliente_id: string;
  nombre: string;
  direccion: string | null;
  colonia: string | null;
  ciudad: string | null;
  estado: string | null;
  cp: string | null;
  lat: number | null;
  lng: number | null;
  radio_geofence_m: number;
  horario_apertura: string | null;
  horario_cierre: string | null;
  notas: string | null;
};

function parseUbicacion(formData: FormData): ParsedUbicacion | string {
  const cliente_id = String(formData.get("cliente_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const direccion = String(formData.get("direccion") ?? "").trim() || null;
  const colonia = String(formData.get("colonia") ?? "").trim() || null;
  const ciudad = String(formData.get("ciudad") ?? "").trim() || null;
  const estado = String(formData.get("estado") ?? "").trim() || null;
  const cp = String(formData.get("cp") ?? "").trim() || null;
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const radioRaw = formData.get("radio_geofence_m");
  const horario_apertura =
    String(formData.get("horario_apertura") ?? "").trim() || null;
  const horario_cierre =
    String(formData.get("horario_cierre") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!cliente_id) return "Falta el cliente.";
  if (!nombre) return "El nombre de la ubicación es obligatorio.";

  let lat: number | null = null;
  if (latRaw && String(latRaw).trim() !== "") {
    const n = Number(latRaw);
    if (!Number.isFinite(n) || n < -90 || n > 90) {
      return "Latitud debe estar entre -90 y 90.";
    }
    lat = n;
  }

  let lng: number | null = null;
  if (lngRaw && String(lngRaw).trim() !== "") {
    const n = Number(lngRaw);
    if (!Number.isFinite(n) || n < -180 || n > 180) {
      return "Longitud debe estar entre -180 y 180.";
    }
    lng = n;
  }

  let radio_geofence_m = 100;
  if (radioRaw && String(radioRaw).trim() !== "") {
    const n = Number(radioRaw);
    if (!Number.isInteger(n) || n < 0) {
      return "Radio de geofence debe ser un entero ≥ 0.";
    }
    radio_geofence_m = n;
  }

  // Validar formato HH:MM o HH:MM:SS
  const isValidTime = (t: string) => /^\d{2}:\d{2}(:\d{2})?$/.test(t);
  if (horario_apertura && !isValidTime(horario_apertura)) {
    return "Horario de apertura debe tener formato HH:MM.";
  }
  if (horario_cierre && !isValidTime(horario_cierre)) {
    return "Horario de cierre debe tener formato HH:MM.";
  }

  return {
    cliente_id,
    nombre,
    direccion,
    colonia,
    ciudad,
    estado,
    cp,
    lat,
    lng,
    radio_geofence_m,
    horario_apertura,
    horario_cierre,
    notas,
  };
}

export async function crearUbicacion(
  _prev: UbicacionResult | null,
  formData: FormData,
): Promise<UbicacionResult> {
  await requireRole(...ROLES);
  const parsed = parseUbicacion(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { error } = await supabase.from("ubicaciones").insert(parsed);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/clientes/${parsed.cliente_id}`);
  redirect(`/admin/clientes/${parsed.cliente_id}`);
}

export async function actualizarUbicacion(
  _prev: UbicacionResult | null,
  formData: FormData,
): Promise<UbicacionResult> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id de la ubicación." };

  const parsed = parseUbicacion(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { error } = await supabase
    .from("ubicaciones")
    .update(parsed)
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/clientes/${parsed.cliente_id}`);
  return { ok: true, message: "Cambios guardados.", id };
}

export async function toggleActivoUbicacion(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const clienteId = String(formData.get("cliente_id") ?? "");
  const activo = formData.get("activo") === "true";
  if (!id) redirect("/admin/clientes");

  const supabase = createClient();
  await supabase.from("ubicaciones").update({ activo }).eq("id", id);

  revalidatePath(`/admin/clientes/${clienteId}`);
  redirect(`/admin/clientes/${clienteId}`);
}
