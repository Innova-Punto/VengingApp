"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion", "compras"] as const;

export type ProveedorResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

type ParsedProveedor = {
  nombre: string;
  rfc: string | null;
  razon_social: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_tel: string | null;
  dias_credito: number;
  notas: string | null;
};

function parseProveedor(formData: FormData): ParsedProveedor | string {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const rfc = String(formData.get("rfc") ?? "").trim().toUpperCase() || null;
  const razon_social =
    String(formData.get("razon_social") ?? "").trim() || null;
  const contacto_nombre =
    String(formData.get("contacto_nombre") ?? "").trim() || null;
  const contacto_email =
    String(formData.get("contacto_email") ?? "").trim().toLowerCase() || null;
  const contacto_tel =
    String(formData.get("contacto_tel") ?? "").trim() || null;
  const diasCreditoRaw = formData.get("dias_credito");
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!nombre) return "Nombre es obligatorio.";
  if (
    contacto_email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto_email)
  ) {
    return "Email de contacto inválido.";
  }

  let dias_credito = 0;
  if (diasCreditoRaw && String(diasCreditoRaw).trim() !== "") {
    const n = Number(diasCreditoRaw);
    if (!Number.isInteger(n) || n < 0) {
      return "Días de crédito debe ser un entero ≥ 0.";
    }
    dias_credito = n;
  }

  return {
    nombre,
    rfc,
    razon_social,
    contacto_nombre,
    contacto_email,
    contacto_tel,
    dias_credito,
    notas,
  };
}

export async function crearProveedor(
  _prev: ProveedorResult | null,
  formData: FormData,
): Promise<ProveedorResult> {
  await requireRole(...ROLES);
  const parsed = parseProveedor(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .insert(parsed)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: `Ya existe un proveedor con el nombre "${parsed.nombre}".`,
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/proveedores");
  redirect(`/admin/proveedores/${data.id}`);
}

export async function actualizarProveedor(
  _prev: ProveedorResult | null,
  formData: FormData,
): Promise<ProveedorResult> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id del proveedor." };

  const parsed = parseProveedor(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { error } = await supabase
    .from("proveedores")
    .update(parsed)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: `Ya existe un proveedor con el nombre "${parsed.nombre}".`,
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/proveedores");
  revalidatePath(`/admin/proveedores/${id}`);
  return { ok: true, message: "Cambios guardados.", id };
}

export async function toggleActivoProveedor(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "true";
  if (!id) redirect("/admin/proveedores");

  const supabase = createClient();
  await supabase.from("proveedores").update({ activo }).eq("id", id);

  revalidatePath("/admin/proveedores");
  redirect("/admin/proveedores");
}

// ------------------------ Presentaciones del proveedor ----------------------

export type PresentacionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type ParsedPresentacion = {
  proveedor_id: string;
  producto_id: string;
  nombre_presentacion: string;
  peso_neto_gramos: number;
  unidades_por_presentacion: number;
  costo_unitario: number;
  moneda: string;
  sku_proveedor: string | null;
};

function parsePresentacion(formData: FormData): ParsedPresentacion | string {
  const proveedor_id = String(formData.get("proveedor_id") ?? "");
  const producto_id = String(formData.get("producto_id") ?? "");
  const nombre_presentacion = String(
    formData.get("nombre_presentacion") ?? "",
  ).trim();
  const pesoRaw = formData.get("peso_neto_gramos");
  const unidadesRaw = formData.get("unidades_por_presentacion");
  const costoRaw = formData.get("costo_unitario");
  const moneda =
    String(formData.get("moneda") ?? "").trim().toUpperCase() || "MXN";
  const sku_proveedor =
    String(formData.get("sku_proveedor") ?? "").trim() || null;

  if (!proveedor_id) return "Falta el proveedor.";
  if (!producto_id) return "Selecciona un producto.";
  if (!nombre_presentacion) {
    return "Nombre de la presentación es obligatorio (ej. 'Saco 10kg').";
  }

  const peso = Number(pesoRaw);
  if (!Number.isInteger(peso) || peso <= 0) {
    return "Peso neto debe ser un entero positivo (gramos).";
  }

  const unidades = unidadesRaw && String(unidadesRaw).trim() !== ""
    ? Number(unidadesRaw)
    : 1;
  if (!Number.isInteger(unidades) || unidades <= 0) {
    return "Unidades por presentación debe ser un entero positivo.";
  }

  const costo = Number(costoRaw);
  if (!Number.isFinite(costo) || costo < 0) {
    return "Costo unitario debe ser un número ≥ 0.";
  }

  return {
    proveedor_id,
    producto_id,
    nombre_presentacion,
    peso_neto_gramos: peso,
    unidades_por_presentacion: unidades,
    costo_unitario: Math.round(costo * 100) / 100,
    moneda,
    sku_proveedor,
  };
}

export async function crearPresentacion(
  _prev: PresentacionResult | null,
  formData: FormData,
): Promise<PresentacionResult> {
  await requireRole(...ROLES);
  const parsed = parsePresentacion(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { error } = await supabase
    .from("presentaciones_proveedor")
    .insert(parsed);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message:
          "Ya existe esa combinación de producto + presentación para este proveedor.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/admin/proveedores/${parsed.proveedor_id}`);
  return { ok: true, message: "Presentación agregada." };
}

export async function actualizarPresentacion(
  _prev: PresentacionResult | null,
  formData: FormData,
): Promise<PresentacionResult> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id." };

  const parsed = parsePresentacion(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { error } = await supabase
    .from("presentaciones_proveedor")
    .update(parsed)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message:
          "Ya existe esa combinación de producto + presentación para este proveedor.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/admin/proveedores/${parsed.proveedor_id}`);
  return { ok: true, message: "Cambios guardados." };
}

export async function toggleActivoPresentacion(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "true";
  const proveedorId = String(formData.get("proveedor_id") ?? "");
  if (!id) redirect("/admin/proveedores");

  const supabase = createClient();
  await supabase
    .from("presentaciones_proveedor")
    .update({ activo })
    .eq("id", id);

  revalidatePath(`/admin/proveedores/${proveedorId}`);
  redirect(`/admin/proveedores/${proveedorId}`);
}
