"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ProductoTipo = Database["public"]["Enums"]["producto_tipo"];

const ROLES_PRODUCTOS = ["admin", "direccion", "compras"] as const;

export type ProductoResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

type ParsedProducto = {
  sku: string;
  nombre: string;
  tipo: ProductoTipo;
  marca: string | null;
  sabor: string | null;
  categoria: string | null;
  cliente_exclusivo_id: string | null;
  gramaje_cartucho_default: number;
  gramaje_servicio_default: number | null;
  precio_venta_default: number | null;
  unidad_medida: string;
  notas: string | null;
  stock_minimo: number;
  stock_maximo: number;
  punto_reorden: number;
  capacidad_g_por_tolva: number | null;
};

function parseProducto(formData: FormData): ParsedProducto | string {
  const sku = String(formData.get("sku") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipoRaw = String(formData.get("tipo") ?? "").trim();
  const marca = String(formData.get("marca") ?? "").trim() || null;
  const sabor = String(formData.get("sabor") ?? "").trim() || null;
  const categoria = String(formData.get("categoria") ?? "").trim() || null;
  const clienteRaw =
    String(formData.get("cliente_exclusivo_id") ?? "").trim() || null;
  const gramajeCartuchoRaw = formData.get("gramaje_cartucho_default");
  const gramajeServicioRaw = formData.get("gramaje_servicio_default");
  const precioRaw = formData.get("precio_venta_default");
  const unidadMedida =
    String(formData.get("unidad_medida") ?? "").trim() || "gramos";
  const notas = String(formData.get("notas") ?? "").trim() || null;
  const stockMinRaw = formData.get("stock_minimo");
  const stockMaxRaw = formData.get("stock_maximo");
  const reordenRaw = formData.get("punto_reorden");

  if (!sku) return "SKU es obligatorio.";
  if (!nombre) return "Nombre es obligatorio.";
  if (tipoRaw !== "polvo" && tipoRaw !== "vaso") {
    return "Tipo debe ser 'polvo' o 'vaso'.";
  }

  const gramajeCartucho = Number(gramajeCartuchoRaw);
  if (!Number.isInteger(gramajeCartucho) || gramajeCartucho <= 0) {
    return "Gramaje cartucho debe ser un entero positivo.";
  }

  let gramajeServicio: number | null = null;
  if (gramajeServicioRaw && String(gramajeServicioRaw).trim() !== "") {
    const n = Number(gramajeServicioRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return "Gramaje servicio debe ser un entero positivo.";
    }
    gramajeServicio = n;
  }

  let precio: number | null = null;
  if (precioRaw && String(precioRaw).trim() !== "") {
    const n = Number(precioRaw);
    if (!Number.isFinite(n) || n < 0) {
      return "Precio debe ser un número ≥ 0.";
    }
    precio = Math.round(n * 100) / 100;
  }

  const parseStock = (raw: FormDataEntryValue | null, label: string) => {
    if (!raw || String(raw).trim() === "") return 0;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      return `${label} debe ser entero ≥ 0.`;
    }
    return n;
  };
  const stockMin = parseStock(stockMinRaw, "Stock mínimo");
  if (typeof stockMin === "string") return stockMin;
  const stockMax = parseStock(stockMaxRaw, "Stock máximo");
  if (typeof stockMax === "string") return stockMax;
  const reorden = parseStock(reordenRaw, "Punto de reorden");
  if (typeof reorden === "string") return reorden;

  const capacidadRaw = formData.get("capacidad_g_por_tolva");
  let capacidad_g_por_tolva: number | null = null;
  if (capacidadRaw && String(capacidadRaw).trim() !== "") {
    const n = Number(capacidadRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return "Capacidad típica en tolva debe ser un entero positivo.";
    }
    capacidad_g_por_tolva = n;
  }

  return {
    sku,
    nombre,
    tipo: tipoRaw,
    marca,
    sabor,
    categoria,
    cliente_exclusivo_id: clienteRaw,
    gramaje_cartucho_default: gramajeCartucho,
    gramaje_servicio_default: gramajeServicio,
    precio_venta_default: precio,
    unidad_medida: unidadMedida,
    notas,
    stock_minimo: stockMin,
    stock_maximo: stockMax,
    punto_reorden: reorden,
    capacidad_g_por_tolva,
  };
}

export async function crearProducto(
  _prev: ProductoResult | null,
  formData: FormData,
): Promise<ProductoResult> {
  await requireRole(...ROLES_PRODUCTOS);
  const parsed = parseProducto(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("productos")
    .insert(parsed)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: `El SKU "${parsed.sku}" ya existe.` };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/productos");
  redirect(`/admin/productos?created=${data.id}`);
}

export async function actualizarProducto(
  _prev: ProductoResult | null,
  formData: FormData,
): Promise<ProductoResult> {
  await requireRole(...ROLES_PRODUCTOS);

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id del producto." };

  const parsed = parseProducto(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { error } = await supabase
    .from("productos")
    .update(parsed)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: `El SKU "${parsed.sku}" ya existe.` };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${id}`);
  return { ok: true, message: "Cambios guardados.", id };
}

export async function toggleActivoProducto(formData: FormData) {
  await requireRole(...ROLES_PRODUCTOS);
  const id = String(formData.get("id") ?? "");
  const activo = formData.get("activo") === "true";
  if (!id) redirect("/admin/productos");

  const supabase = createClient();
  await supabase.from("productos").update({ activo }).eq("id", id);

  revalidatePath("/admin/productos");
  redirect("/admin/productos");
}
