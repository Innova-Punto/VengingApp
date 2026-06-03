"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion"] as const;

export type RecetaResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

type ParsedItem = {
  nayax_item_code: string;
  nombre: string;
  precio_venta: number | null;
  ingredientes: { tolva_numero: number; gramos: number }[];
};

const MAX_ITEMS = 16;

function parseItems(
  formData: FormData,
  numTolvas: number,
): { items: ParsedItem[]; error?: string } {
  const items: ParsedItem[] = [];
  for (let i = 1; i <= MAX_ITEMS; i++) {
    const paCode = String(formData.get(`item_${i}_pa_code`) ?? "").trim();
    const nombre = String(formData.get(`item_${i}_nombre`) ?? "").trim();
    const precioRaw = formData.get(`item_${i}_precio`);

    // Reúne ingredientes con gramos > 0
    const ingredientes: { tolva_numero: number; gramos: number }[] = [];
    for (let t = 1; t <= numTolvas; t++) {
      const gramosRaw = formData.get(`item_${i}_tolva_${t}_gramos`);
      if (gramosRaw == null || String(gramosRaw).trim() === "") continue;
      const gramos = Number(gramosRaw);
      if (!Number.isFinite(gramos) || gramos <= 0) continue;
      if (!Number.isInteger(gramos)) {
        return {
          items: [],
          error: `Bebida #${i} tolva #${t}: gramos deben ser entero.`,
        };
      }
      ingredientes.push({ tolva_numero: t, gramos });
    }

    const hayAlgo =
      paCode !== "" ||
      nombre !== "" ||
      (precioRaw != null && String(precioRaw).trim() !== "") ||
      ingredientes.length > 0;
    if (!hayAlgo) continue;

    if (!paCode) return { items: [], error: `Bebida #${i}: falta PA Code.` };
    if (!nombre) return { items: [], error: `Bebida #${i}: falta nombre.` };
    if (ingredientes.length === 0) {
      return {
        items: [],
        error: `Bebida #${i} (${nombre}): debe tener al menos un ingrediente.`,
      };
    }

    let precio: number | null = null;
    if (precioRaw != null && String(precioRaw).trim() !== "") {
      const p = Number(precioRaw);
      if (!Number.isFinite(p) || p < 0) {
        return { items: [], error: `Bebida #${i}: precio debe ser ≥ 0.` };
      }
      precio = Math.round(p * 100) / 100;
    }

    items.push({
      nayax_item_code: paCode,
      nombre,
      precio_venta: precio,
      ingredientes,
    });
  }

  // Detecta PA Codes duplicados
  const codes = items.map((it) => it.nayax_item_code);
  const dup = codes.find((c, idx) => codes.indexOf(c) !== idx);
  if (dup) {
    return { items: [], error: `PA Code "${dup}" repetido en la receta.` };
  }

  return { items };
}

async function insertarItems(
  supabaseAny: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  recetaId: string,
  items: ParsedItem[],
): Promise<string | null> {
  for (const it of items) {
    const { data: itemRow, error: itemErr } = await supabaseAny
      .from("receta_items")
      .insert({
        receta_id: recetaId,
        nayax_item_code: it.nayax_item_code,
        nombre: it.nombre,
        precio_venta: it.precio_venta,
      })
      .select("id")
      .single();
    if (itemErr) return itemErr.message;
    const ingrRows = it.ingredientes.map((ing) => ({
      receta_item_id: itemRow.id,
      tolva_numero: ing.tolva_numero,
      gramos: ing.gramos,
    }));
    const { error: ingErr } = await supabaseAny
      .from("receta_item_ingredientes")
      .insert(ingrRows);
    if (ingErr) return ingErr.message;
  }
  return null;
}

export async function crearReceta(
  _prev: RecetaResult | null,
  formData: FormData,
): Promise<RecetaResult> {
  await requireRole(...ROLES);

  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const numTolvasRaw = formData.get("num_tolvas");
  const num_tolvas = numTolvasRaw ? Number(numTolvasRaw) : 8;

  if (!nombre) return { ok: false, message: "Nombre es obligatorio." };
  if (!Number.isInteger(num_tolvas) || num_tolvas < 1 || num_tolvas > 8) {
    return { ok: false, message: "Número de tolvas debe estar entre 1 y 8." };
  }

  const { items, error: parseError } = parseItems(formData, num_tolvas);
  if (parseError) return { ok: false, message: parseError };

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const { data: receta, error } = await supabaseAny
    .from("recetas")
    .insert({ nombre, descripcion, num_tolvas })
    .select("id")
    .single();
  if (error) {
    return { ok: false, message: error.message };
  }

  if (items.length > 0) {
    const err = await insertarItems(supabaseAny, receta.id, items);
    if (err) return { ok: false, message: `Items: ${err}` };
  }

  revalidatePath("/admin/recetas");
  redirect(`/admin/recetas/${receta.id}`);
}

export async function actualizarReceta(
  _prev: RecetaResult | null,
  formData: FormData,
): Promise<RecetaResult> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id." };

  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const numTolvasRaw = formData.get("num_tolvas");
  const num_tolvas = numTolvasRaw ? Number(numTolvasRaw) : 8;

  if (!nombre) return { ok: false, message: "Nombre es obligatorio." };
  if (!Number.isInteger(num_tolvas) || num_tolvas < 1 || num_tolvas > 8) {
    return { ok: false, message: "Número de tolvas debe estar entre 1 y 8." };
  }

  const { items, error: parseError } = parseItems(formData, num_tolvas);
  if (parseError) return { ok: false, message: parseError };

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  const { error: updErr } = await supabaseAny
    .from("recetas")
    .update({ nombre, descripcion, num_tolvas })
    .eq("id", id);
  if (updErr) return { ok: false, message: updErr.message };

  // Reemplaza items completos (cascade borra ingredientes)
  const { error: delErr } = await supabaseAny
    .from("receta_items")
    .delete()
    .eq("receta_id", id);
  if (delErr) return { ok: false, message: `Items: ${delErr.message}` };

  if (items.length > 0) {
    const err = await insertarItems(supabaseAny, id, items);
    if (err) return { ok: false, message: `Items: ${err}` };
  }

  revalidatePath("/admin/recetas");
  revalidatePath(`/admin/recetas/${id}`);
  return { ok: true, message: "Receta actualizada." };
}

export async function toggleActivoReceta(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "true";
  if (!id) redirect("/admin/recetas");

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("recetas").update({ activo }).eq("id", id);

  revalidatePath("/admin/recetas");
  redirect("/admin/recetas");
}

// ============================================================================
// Aplicar receta a una máquina
// ============================================================================

export type AplicarResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function aplicarReceta(
  _prev: AplicarResult | null,
  formData: FormData,
): Promise<AplicarResult> {
  await requireRole(...ROLES);

  const receta_id = String(formData.get("receta_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");

  if (!receta_id) return { ok: false, message: "Selecciona una receta." };
  if (!maquina_id) return { ok: false, message: "Falta la máquina." };

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  // Lee items y sus ingredientes
  const { data: items, error: itemsErr } = await supabaseAny
    .from("receta_items")
    .select("id, nayax_item_code, nombre, precio_venta")
    .eq("receta_id", receta_id);
  if (itemsErr) return { ok: false, message: itemsErr.message };
  if (!items || items.length === 0) {
    return { ok: false, message: "La receta no tiene bebidas configuradas." };
  }

  const itemIds = items.map((it: { id: string }) => it.id);
  const { data: ingr, error: ingErr } = await supabaseAny
    .from("receta_item_ingredientes")
    .select("receta_item_id, tolva_numero, gramos")
    .in("receta_item_id", itemIds);
  if (ingErr) return { ok: false, message: ingErr.message };

  // Lee tolvas de la máquina destino para mapear numero → id
  const { data: tolvas, error: tolvErr } = await supabaseAny
    .from("tolvas")
    .select("id, numero")
    .eq("maquina_id", maquina_id);
  if (tolvErr) return { ok: false, message: tolvErr.message };
  const tolvaPorNumero = new Map<number, string>();
  for (const t of tolvas ?? []) tolvaPorNumero.set(t.numero, t.id);

  // Borra config previa de receta en esa máquina (cascade borra ingredientes)
  const { error: delErr } = await supabaseAny
    .from("maquina_items")
    .delete()
    .eq("maquina_id", maquina_id);
  if (delErr) return { ok: false, message: `Limpieza: ${delErr.message}` };

  let aplicadas = 0;
  for (const it of items) {
    // Inserta header
    const { data: miRow, error: miErr } = await supabaseAny
      .from("maquina_items")
      .insert({
        maquina_id,
        nayax_item_code: it.nayax_item_code,
        nombre: it.nombre,
        precio_venta: it.precio_venta,
      })
      .select("id")
      .single();
    if (miErr) {
      return { ok: false, message: `${it.nombre}: ${miErr.message}` };
    }

    // Mapea ingredientes (tolva_numero → tolva_id)
    const rows = (ingr ?? [])
      .filter(
        (g: { receta_item_id: string }) => g.receta_item_id === it.id,
      )
      .map((g: { tolva_numero: number; gramos: number }) => {
        const tolvaId = tolvaPorNumero.get(g.tolva_numero);
        return tolvaId
          ? { maquina_item_id: miRow.id, tolva_id: tolvaId, gramos: g.gramos }
          : null;
      })
      .filter(
        (r: unknown): r is { maquina_item_id: string; tolva_id: string; gramos: number } =>
          !!r,
      );

    if (rows.length === 0) {
      return {
        ok: false,
        message: `${it.nombre}: ningún ingrediente coincide con tolvas de la máquina.`,
      };
    }

    const { error: insErr } = await supabaseAny
      .from("maquina_item_ingredientes")
      .insert(rows);
    if (insErr) return { ok: false, message: `${it.nombre}: ${insErr.message}` };
    aplicadas++;
  }

  revalidatePath(`/admin/maquinas/${maquina_id}`);
  return {
    ok: true,
    message: `Receta aplicada. ${aplicadas} bebida(s) configurada(s).`,
  };
}
