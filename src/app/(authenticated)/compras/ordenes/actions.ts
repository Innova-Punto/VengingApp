"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type OcEstado = Database["public"]["Enums"]["oc_estado"];

const ROLES = ["admin", "direccion", "compras"] as const;

// ============================================================================
// OC
// ============================================================================

export type OcResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

export async function crearOc(
  _prev: OcResult | null,
  formData: FormData,
): Promise<OcResult> {
  const current = await requireRole(...ROLES);

  const proveedor_id = String(formData.get("proveedor_id") ?? "");
  const fecha_emision =
    String(formData.get("fecha_emision") ?? "").trim() || null;
  const fecha_esperada =
    String(formData.get("fecha_esperada") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!proveedor_id) return { ok: false, message: "Selecciona un proveedor." };

  const supabase = createClient();
  // folio lo asigna el trigger trg_oc_folio; el tipo lo marca como required
  // así que lo dejamos como cadena vacía y el trigger lo sobrescribe.
  const { data, error } = await supabase
    .from("ordenes_compra")
    .insert({
      folio: "",
      proveedor_id,
      fecha_emision: fecha_emision ?? new Date().toISOString().slice(0, 10),
      fecha_esperada,
      notas,
      creado_por: current.id,
      estado: "borrador",
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };

  revalidatePath("/compras/ordenes");
  redirect(`/compras/ordenes/${data.id}`);
}

export async function actualizarOc(
  _prev: OcResult | null,
  formData: FormData,
): Promise<OcResult> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id." };

  const fecha_esperada =
    String(formData.get("fecha_esperada") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;

  const supabase = createClient();
  const { error } = await supabase
    .from("ordenes_compra")
    .update({ fecha_esperada, notas })
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/compras/ordenes/${id}`);
  return { ok: true, message: "Datos actualizados.", id };
}

async function cambiarEstadoOc(
  ocId: string,
  estado: OcEstado,
  current: { id: string },
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("ordenes_compra")
    .update(
      estado === "enviada"
        ? {
            estado,
            aprobado_por: current.id,
            fecha_aprobacion: new Date().toISOString(),
          }
        : { estado },
    )
    .eq("id", ocId);
  if (error) throw new Error(error.message);
}

export async function aprobarOc(formData: FormData) {
  const current = await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/compras/ordenes");
  await cambiarEstadoOc(id, "enviada", current);
  revalidatePath(`/compras/ordenes/${id}`);
  redirect(`/compras/ordenes/${id}`);
}

export async function cancelarOc(formData: FormData) {
  const current = await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/compras/ordenes");
  await cambiarEstadoOc(id, "cancelada", current);
  revalidatePath(`/compras/ordenes/${id}`);
  redirect("/compras/ordenes");
}

/**
 * Cierra una OC en estado 'parcial' como recibida, dejando faltantes.
 * Útil cuando el proveedor no puede surtir el resto y se compra a otro.
 * Guarda el motivo en motivo_cierre.
 */
export async function cerrarOcIncompleta(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!id) redirect("/compras/ordenes");
  if (!motivo) {
    redirect(`/compras/ordenes/${id}?error=motivo_requerido`);
  }

  const supabase = createClient();
  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("estado")
    .eq("id", id)
    .maybeSingle();
  if (!oc) redirect("/compras/ordenes");
  if (oc.estado !== "parcial") {
    redirect(`/compras/ordenes/${id}?error=estado_invalido`);
  }

  await supabase
    .from("ordenes_compra")
    .update({ estado: "recibida", motivo_cierre: motivo })
    .eq("id", id);

  revalidatePath(`/compras/ordenes/${id}`);
  revalidatePath("/compras/ordenes");
  redirect(`/compras/ordenes/${id}`);
}

// ============================================================================
// Items
// ============================================================================

export type ItemResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function agregarItem(
  _prev: ItemResult | null,
  formData: FormData,
): Promise<ItemResult> {
  await requireRole(...ROLES);

  const oc_id = String(formData.get("oc_id") ?? "");
  const presentacion_id = String(formData.get("presentacion_id") ?? "");
  const cantidadRaw = formData.get("cantidad");
  const costoRaw = formData.get("costo_unitario");
  const ivaTasaRaw = formData.get("iva_tasa");
  const incluyeIva = formData.get("costo_incluye_iva") === "on";
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!oc_id) return { ok: false, message: "Falta la OC." };
  if (!presentacion_id) return { ok: false, message: "Selecciona una presentación." };

  const cantidad = Number(cantidadRaw);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return { ok: false, message: "Cantidad debe ser un entero > 0." };
  }
  const costoCapturado = Number(costoRaw);
  if (!Number.isFinite(costoCapturado) || costoCapturado < 0) {
    return { ok: false, message: "Costo debe ser ≥ 0." };
  }
  const iva_tasa = ivaTasaRaw ? Number(ivaTasaRaw) : 0.16;
  if (!Number.isFinite(iva_tasa) || iva_tasa < 0 || iva_tasa > 1) {
    return { ok: false, message: "Tasa de IVA inválida." };
  }

  // Desglose: si el precio incluye IVA, dividir por (1+tasa) antes de guardar.
  const costo_unitario = incluyeIva
    ? Math.round((costoCapturado / (1 + iva_tasa)) * 100) / 100
    : Math.round(costoCapturado * 100) / 100;
  const subtotal_item = Math.round(cantidad * costo_unitario * 100) / 100;

  const supabase = createClient();

  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("estado")
    .eq("id", oc_id)
    .maybeSingle();
  if (!oc) return { ok: false, message: "OC no encontrada." };
  if (oc.estado !== "borrador") {
    return {
      ok: false,
      message:
        "Solo se pueden agregar items mientras la OC esté en borrador.",
    };
  }

  const { error } = await supabase.from("oc_items").insert({
    oc_id,
    presentacion_id,
    cantidad,
    costo_unitario,
    iva_tasa,
    subtotal_item,
    notas,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/compras/ordenes/${oc_id}`);
  return { ok: true, message: "Item agregado." };
}

export async function eliminarItem(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const oc_id = String(formData.get("oc_id") ?? "");
  if (!id || !oc_id) redirect("/compras/ordenes");

  const supabase = createClient();
  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("estado")
    .eq("id", oc_id)
    .maybeSingle();
  if (oc?.estado === "borrador") {
    await supabase.from("oc_items").delete().eq("id", id);
  }

  revalidatePath(`/compras/ordenes/${oc_id}`);
  redirect(`/compras/ordenes/${oc_id}`);
}
