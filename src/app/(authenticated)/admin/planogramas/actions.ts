"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion"] as const;

// ============================================================================
// Planograma (template)
// ============================================================================

export type PlanogramaResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

type ParsedItem = {
  numero: number;
  producto_id: string;
  gramaje_servicio: number;
  precio_venta: number;
  nayax_item_code: string | null;
};

function parseItems(
  formData: FormData,
  numTolvas: number,
): { items: ParsedItem[]; error?: string } {
  const items: ParsedItem[] = [];
  for (let i = 1; i <= numTolvas; i++) {
    const producto_id = String(formData.get(`producto_id_${i}`) ?? "").trim();
    const gramajeRaw = formData.get(`gramaje_servicio_${i}`);
    const precioRaw = formData.get(`precio_venta_${i}`);
    const nayaxRaw = String(
      formData.get(`nayax_item_code_${i}`) ?? "",
    ).trim();

    // Fila completamente vacía: se omite (tolva sin asignar en el template).
    const hayAlgo =
      producto_id !== "" ||
      (gramajeRaw && String(gramajeRaw).trim() !== "") ||
      (precioRaw && String(precioRaw).trim() !== "") ||
      nayaxRaw !== "";

    if (!hayAlgo) continue;

    if (!producto_id) {
      return { items: [], error: `Tolva #${i}: falta el producto.` };
    }
    const gramaje = Number(gramajeRaw);
    if (!Number.isInteger(gramaje) || gramaje <= 0) {
      return {
        items: [],
        error: `Tolva #${i}: gramaje debe ser un entero > 0.`,
      };
    }
    const precio = Number(precioRaw);
    if (!Number.isFinite(precio) || precio < 0) {
      return { items: [], error: `Tolva #${i}: precio debe ser ≥ 0.` };
    }

    items.push({
      numero: i,
      producto_id,
      gramaje_servicio: gramaje,
      precio_venta: Math.round(precio * 100) / 100,
      nayax_item_code: nayaxRaw || null,
    });
  }
  return { items };
}

export async function crearPlanograma(
  _prev: PlanogramaResult | null,
  formData: FormData,
): Promise<PlanogramaResult> {
  const current = await requireRole(...ROLES);

  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion =
    String(formData.get("descripcion") ?? "").trim() || null;
  const numTolvasRaw = formData.get("num_tolvas");
  const num_tolvas = numTolvasRaw ? Number(numTolvasRaw) : 8;

  if (!nombre) return { ok: false, message: "Nombre es obligatorio." };
  if (!Number.isInteger(num_tolvas) || num_tolvas < 1 || num_tolvas > 8) {
    return { ok: false, message: "Número de tolvas debe estar entre 1 y 8." };
  }

  const { items, error: parseError } = parseItems(formData, num_tolvas);
  if (parseError) return { ok: false, message: parseError };

  const supabase = createClient();

  const { data: planograma, error } = await supabase
    .from("planogramas")
    .insert({ nombre, descripcion, num_tolvas, created_by: current.id })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: `Ya existe un planograma con el nombre "${nombre}".`,
      };
    }
    return { ok: false, message: error.message };
  }

  if (items.length > 0) {
    const rows = items.map((it) => ({
      planograma_id: planograma.id,
      ...it,
    }));
    const { error: itemsErr } = await supabase
      .from("planograma_items")
      .insert(rows);
    if (itemsErr) {
      return { ok: false, message: `Items: ${itemsErr.message}` };
    }
  }

  revalidatePath("/admin/planogramas");
  redirect(`/admin/planogramas/${planograma.id}`);
}

export async function actualizarPlanograma(
  _prev: PlanogramaResult | null,
  formData: FormData,
): Promise<PlanogramaResult> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id del planograma." };

  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion =
    String(formData.get("descripcion") ?? "").trim() || null;
  const numTolvasRaw = formData.get("num_tolvas");
  const num_tolvas = numTolvasRaw ? Number(numTolvasRaw) : 8;

  if (!nombre) return { ok: false, message: "Nombre es obligatorio." };
  if (!Number.isInteger(num_tolvas) || num_tolvas < 1 || num_tolvas > 8) {
    return { ok: false, message: "Número de tolvas debe estar entre 1 y 8." };
  }

  const { items, error: parseError } = parseItems(formData, num_tolvas);
  if (parseError) return { ok: false, message: parseError };

  const supabase = createClient();

  // Actualiza el header
  const { error: updErr } = await supabase
    .from("planogramas")
    .update({ nombre, descripcion, num_tolvas })
    .eq("id", id);
  if (updErr) {
    if (updErr.code === "23505") {
      return {
        ok: false,
        message: `Ya existe un planograma con el nombre "${nombre}".`,
      };
    }
    return { ok: false, message: updErr.message };
  }

  // Reemplaza items: borra y vuelve a insertar
  const { error: delErr } = await supabase
    .from("planograma_items")
    .delete()
    .eq("planograma_id", id);
  if (delErr) return { ok: false, message: `Items: ${delErr.message}` };

  if (items.length > 0) {
    const rows = items.map((it) => ({ planograma_id: id, ...it }));
    const { error: insErr } = await supabase
      .from("planograma_items")
      .insert(rows);
    if (insErr) return { ok: false, message: `Items: ${insErr.message}` };
  }

  revalidatePath("/admin/planogramas");
  revalidatePath(`/admin/planogramas/${id}`);
  return { ok: true, message: "Planograma actualizado." };
}

export async function toggleActivoPlanograma(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "true";
  if (!id) redirect("/admin/planogramas");

  const supabase = createClient();
  await supabase.from("planogramas").update({ activo }).eq("id", id);

  revalidatePath("/admin/planogramas");
  redirect("/admin/planogramas");
}

// ============================================================================
// Aplicar planograma a una máquina
// ============================================================================

export type AplicarResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function aplicarPlanograma(
  _prev: AplicarResult | null,
  formData: FormData,
): Promise<AplicarResult> {
  await requireRole(...ROLES);

  const planograma_id = String(formData.get("planograma_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");

  if (!planograma_id) return { ok: false, message: "Selecciona un planograma." };
  if (!maquina_id) return { ok: false, message: "Falta la máquina." };

  const supabase = createClient();

  const { data: items, error: itemsErr } = await supabase
    .from("planograma_items")
    .select("numero, producto_id, gramaje_servicio, precio_venta, nayax_item_code")
    .eq("planograma_id", planograma_id);

  if (itemsErr) return { ok: false, message: itemsErr.message };
  if (!items || items.length === 0) {
    return { ok: false, message: "Este planograma no tiene tolvas configuradas." };
  }

  let aplicadas = 0;
  for (const item of items) {
    const { error } = await supabase
      .from("tolvas")
      .update({
        producto_id: item.producto_id,
        gramaje_servicio: item.gramaje_servicio,
        precio_venta: item.precio_venta,
        nayax_item_code: item.nayax_item_code,
      })
      .eq("maquina_id", maquina_id)
      .eq("numero", item.numero);
    if (error) {
      return {
        ok: false,
        message: `Tolva #${item.numero}: ${error.message}`,
      };
    }
    aplicadas++;
  }

  revalidatePath(`/admin/maquinas/${maquina_id}`);
  return {
    ok: true,
    message: `Planograma aplicado. ${aplicadas} tolva(s) configurada(s).`,
  };
}
