"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type MaquinaEstado = Database["public"]["Enums"]["maquina_estado"];

const ROLES = ["admin", "direccion"] as const;

// ============================================================================
// Máquina
// ============================================================================

export type MaquinaResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

type ParsedMaquina = {
  serie: string;
  alias: string | null;
  ubicacion_id: string;
  modelo: string | null;
  num_tolvas: number;
  capacidad_max_tolva_g: number;
  nayax_machine_id: string | null;
  nayax_serial: string | null;
  frecuencia_visita_dias: number;
  qr_codigo: string | null;
  estado: MaquinaEstado;
  fecha_instalacion: string | null;
  notas: string | null;
  vaso_producto_id: string | null;
  vaso_capacidad_max: number;
};

function parseMaquina(
  formData: FormData,
  options: { isCreate: boolean },
): ParsedMaquina | string {
  const serie = String(formData.get("serie") ?? "").trim();
  const alias = String(formData.get("alias") ?? "").trim() || null;
  const ubicacion_id = String(formData.get("ubicacion_id") ?? "");
  const modelo = String(formData.get("modelo") ?? "").trim() || null;
  const numTolvasRaw = formData.get("num_tolvas");
  const capacidadRaw = formData.get("capacidad_max_tolva_g");
  const nayax_machine_id =
    String(formData.get("nayax_machine_id") ?? "").trim() || null;
  const nayax_serial =
    String(formData.get("nayax_serial") ?? "").trim() || null;
  const frecuenciaRaw = formData.get("frecuencia_visita_dias");
  const qr_codigo = String(formData.get("qr_codigo") ?? "").trim() || null;
  const estadoRaw = String(formData.get("estado") ?? "operativa");
  const fechaInst =
    String(formData.get("fecha_instalacion") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;
  const vasoProductoRaw =
    String(formData.get("vaso_producto_id") ?? "").trim() || null;
  const vasoCapacidadRaw = formData.get("vaso_capacidad_max");

  if (!serie) return "Número de serie es obligatorio.";
  if (!ubicacion_id) return "Selecciona una ubicación.";

  const num_tolvas = numTolvasRaw ? Number(numTolvasRaw) : 8;
  if (!Number.isInteger(num_tolvas) || num_tolvas < 1 || num_tolvas > 8) {
    return "Número de tolvas debe estar entre 1 y 8.";
  }

  const capacidad_max_tolva_g = capacidadRaw ? Number(capacidadRaw) : 2000;
  if (!Number.isInteger(capacidad_max_tolva_g) || capacidad_max_tolva_g <= 0) {
    return "Capacidad máxima por tolva debe ser un entero positivo.";
  }

  const frecuencia_visita_dias = frecuenciaRaw ? Number(frecuenciaRaw) : 7;
  if (
    !Number.isInteger(frecuencia_visita_dias) ||
    frecuencia_visita_dias <= 0
  ) {
    return "Frecuencia de visita debe ser un entero positivo (días).";
  }

  if (
    estadoRaw !== "operativa" &&
    estadoRaw !== "mantenimiento" &&
    estadoRaw !== "baja"
  ) {
    return "Estado inválido.";
  }

  let vaso_capacidad_max = 300;
  if (vasoCapacidadRaw && String(vasoCapacidadRaw).trim() !== "") {
    const n = Number(vasoCapacidadRaw);
    if (!Number.isInteger(n) || n < 0) {
      return "Capacidad de vasos debe ser un entero ≥ 0.";
    }
    vaso_capacidad_max = n;
  }

  // En edit no permitimos cambiar num_tolvas (rompería tolvas existentes).
  if (!options.isCreate) {
    // num_tolvas se ignora en update por seguridad; lo mantenemos como info.
  }

  return {
    serie,
    alias,
    ubicacion_id,
    modelo,
    num_tolvas,
    capacidad_max_tolva_g,
    nayax_machine_id,
    nayax_serial,
    frecuencia_visita_dias,
    qr_codigo,
    estado: estadoRaw,
    fecha_instalacion: fechaInst,
    notas,
    vaso_producto_id: vasoProductoRaw,
    vaso_capacidad_max,
  };
}

export async function crearMaquina(
  _prev: MaquinaResult | null,
  formData: FormData,
): Promise<MaquinaResult> {
  await requireRole(...ROLES);
  const parsed = parseMaquina(formData, { isCreate: true });
  if (typeof parsed === "string") return { ok: false, message: parsed };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("maquinas")
    .insert(parsed)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message:
          "Ya existe una máquina con esa serie, nayax_machine_id o QR. Revisa los valores únicos.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/maquinas");
  redirect(`/admin/maquinas/${data.id}`);
}

export async function actualizarMaquina(
  _prev: MaquinaResult | null,
  formData: FormData,
): Promise<MaquinaResult> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Falta el id." };

  const parsed = parseMaquina(formData, { isCreate: false });
  if (typeof parsed === "string") return { ok: false, message: parsed };

  // num_tolvas y capacidad no se actualizan post-creación para no
  // afectar tolvas existentes.
  const {
    num_tolvas,
    capacidad_max_tolva_g,
    ...rest
  } = parsed;
  void num_tolvas;
  void capacidad_max_tolva_g;

  const supabase = createClient();
  const { error } = await supabase
    .from("maquinas")
    .update(rest)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message:
          "Ya existe una máquina con esa serie, nayax_machine_id o QR.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/maquinas");
  revalidatePath(`/admin/maquinas/${id}`);
  return { ok: true, message: "Cambios guardados.", id };
}

export async function cambiarEstadoMaquina(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "") as MaquinaEstado;
  if (!id) redirect("/admin/maquinas");

  const supabase = createClient();
  await supabase.from("maquinas").update({ estado }).eq("id", id);

  revalidatePath("/admin/maquinas");
  revalidatePath(`/admin/maquinas/${id}`);
  redirect(`/admin/maquinas/${id}`);
}

// ============================================================================
// Tolvas (configuración del planograma)
// ============================================================================

export type TolvaResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function actualizarTolva(
  _prev: TolvaResult | null,
  formData: FormData,
): Promise<TolvaResult> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  const maquinaId = String(formData.get("maquina_id") ?? "");
  if (!id) return { ok: false, message: "Falta el id de la tolva." };

  const productoRaw = String(formData.get("producto_id") ?? "").trim();
  const gramajeRaw = formData.get("gramaje_servicio");
  const precioRaw = formData.get("precio_venta");
  const nayaxCode =
    String(formData.get("nayax_item_code") ?? "").trim() || null;

  const producto_id = productoRaw || null;

  let gramaje_servicio: number | null = null;
  if (gramajeRaw && String(gramajeRaw).trim() !== "") {
    const n = Number(gramajeRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, message: "Gramaje servicio debe ser entero > 0." };
    }
    gramaje_servicio = n;
  }

  let precio_venta: number | null = null;
  if (precioRaw && String(precioRaw).trim() !== "") {
    const n = Number(precioRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, message: "Precio debe ser ≥ 0." };
    }
    precio_venta = Math.round(n * 100) / 100;
  }

  if (
    producto_id &&
    (gramaje_servicio === null || precio_venta === null)
  ) {
    return {
      ok: false,
      message:
        "Si asignas un producto, debes especificar gramaje de servicio y precio.",
    };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("tolvas")
    .update({
      producto_id,
      gramaje_servicio,
      precio_venta,
      nayax_item_code: nayaxCode,
    })
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/maquinas/${maquinaId}`);
  return { ok: true, message: "Tolva actualizada." };
}
