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
  tipo: "polvo_directo" | "preparado";
  requiere_pesaje: boolean;
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
  const tipoRaw = String(formData.get("tipo") ?? "polvo_directo");
  const requiere_pesaje = formData.get("requiere_pesaje") === "true";
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

  if (tipoRaw !== "polvo_directo" && tipoRaw !== "preparado") {
    return "Tipo de máquina inválido.";
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
    tipo: tipoRaw,
    requiere_pesaje,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  // Detecta cambio de tipo y limpia la config previa del modelo opuesto
  // para que los triggers de integridad no rechacen el update.
  const { data: actual } = await supabaseAny
    .from("maquinas")
    .select("tipo")
    .eq("id", id)
    .maybeSingle();
  const tipoAnterior = (actual?.tipo as string | undefined) ?? "polvo_directo";
  const tipoNuevo = rest.tipo;

  if (tipoAnterior !== tipoNuevo) {
    if (tipoNuevo === "preparado") {
      // Limpia PA Codes de tolvas (sin tocar producto/gramaje, el polvo sigue ahí)
      const { error: clrErr } = await supabaseAny
        .from("tolvas")
        .update({ nayax_item_code: null })
        .eq("maquina_id", id);
      if (clrErr) return { ok: false, message: `Limpiando PA Codes: ${clrErr.message}` };
    } else {
      // Borra recetas configuradas en la máquina (cascade borra ingredientes)
      const { error: clrErr } = await supabaseAny
        .from("maquina_items")
        .delete()
        .eq("maquina_id", id);
      if (clrErr) return { ok: false, message: `Limpiando recetas: ${clrErr.message}` };
    }
  }

  const { error } = await supabaseAny
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
// Duplicar máquina (copia config base + planograma de tolvas)
// ============================================================================
//
// Crea una nueva máquina copiando los campos de configuración (modelo, número
// de tolvas, capacidades, frecuencia de visita, ubicación, vaso). La serie y
// el alias se generan derivados de los originales para que el usuario los
// edite después; nayax_machine_id / nayax_serial / qr_codigo se dejan vacíos
// para no chocar con los unique constraints.
//
// Tras crear, copia la configuración de cada tolva (producto, gramaje,
// precio, nayax_item_code) emparejando por número. El trigger
// trg_maquina_create_tolvas crea las tolvas vacías al insertar la máquina.

export async function duplicarMaquina(formData: FormData): Promise<void> {
  await requireRole(...ROLES);

  const sourceId = String(formData.get("id") ?? "");
  if (!sourceId) redirect("/admin/maquinas");

  const supabase = createClient();

  const { data: src } = await supabase
    .from("maquinas")
    .select(
      `serie, alias, ubicacion_id, modelo, num_tolvas,
       capacidad_max_tolva_g, frecuencia_visita_dias, fecha_instalacion,
       notas, vaso_producto_id, vaso_capacidad_max`,
    )
    .eq("id", sourceId)
    .maybeSingle();
  if (!src) {
    redirect("/admin/maquinas?error=" + encodeURIComponent("Máquina origen no encontrada."));
  }

  // Serie derivada con sufijo único. El usuario la editará después.
  const sufijo = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  const nuevaSerie = `${src.serie}-COPIA-${sufijo}`;
  const nuevoAlias = src.alias ? `Copia de ${src.alias}` : null;

  const { data: nueva, error: insErr } = await supabase
    .from("maquinas")
    .insert({
      serie: nuevaSerie,
      alias: nuevoAlias,
      ubicacion_id: src.ubicacion_id,
      modelo: src.modelo,
      num_tolvas: src.num_tolvas,
      capacidad_max_tolva_g: src.capacidad_max_tolva_g,
      frecuencia_visita_dias: src.frecuencia_visita_dias,
      fecha_instalacion: src.fecha_instalacion,
      notas: src.notas,
      vaso_producto_id: src.vaso_producto_id,
      vaso_capacidad_max: src.vaso_capacidad_max,
      estado: "mantenimiento",
    })
    .select("id")
    .single();

  if (insErr || !nueva) {
    redirect(
      "/admin/maquinas?error=" +
        encodeURIComponent(insErr?.message ?? "No se pudo crear la copia."),
    );
  }

  // El trigger trg_maquina_create_tolvas ya creó las tolvas vacías de la nueva.
  // Copia la configuración de cada tolva emparejando por número.
  const [{ data: srcTolvas }, { data: dstTolvas }] = await Promise.all([
    supabase
      .from("tolvas")
      .select("numero, producto_id, gramaje_servicio, precio_venta, nayax_item_code")
      .eq("maquina_id", sourceId),
    supabase
      .from("tolvas")
      .select("id, numero")
      .eq("maquina_id", nueva.id),
  ]);

  const dstPorNumero = new Map<number, string>();
  for (const t of dstTolvas ?? []) dstPorNumero.set(t.numero, t.id);

  for (const s of srcTolvas ?? []) {
    const dstId = dstPorNumero.get(s.numero);
    if (!dstId) continue;
    // nayax_item_code se queda vacío en el destino para evitar choque del
    // unique constraint global por nayax_item_code.
    await supabase
      .from("tolvas")
      .update({
        producto_id: s.producto_id,
        gramaje_servicio: s.gramaje_servicio,
        precio_venta: s.precio_venta,
        nayax_item_code: null,
      })
      .eq("id", dstId);
  }

  revalidatePath("/admin/maquinas");
  redirect(`/admin/maquinas/${nueva.id}`);
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
  // Solo actualizamos nayax_item_code si el input estaba presente en el form
  // (en máquinas tipo "preparado" el input está oculto y no se manda).
  const nayaxCodeProvided = formData.has("nayax_item_code");
  const nayaxCode = nayaxCodeProvided
    ? String(formData.get("nayax_item_code") ?? "").trim() || null
    : null;

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

  const overrideRaw = formData.get("capacidad_max_g_override");
  let capacidad_max_g_override: number | null = null;
  if (overrideRaw && String(overrideRaw).trim() !== "") {
    const n = Number(overrideRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return {
        ok: false,
        message: "Capacidad override debe ser entero > 0.",
      };
    }
    capacidad_max_g_override = n;
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
  const updatePayload: {
    producto_id: string | null;
    gramaje_servicio: number | null;
    precio_venta: number | null;
    capacidad_max_g_override: number | null;
    nayax_item_code?: string | null;
  } = {
    producto_id,
    gramaje_servicio,
    precio_venta,
    capacidad_max_g_override,
  };
  if (nayaxCodeProvided) updatePayload.nayax_item_code = nayaxCode;

  const { error } = await supabase
    .from("tolvas")
    .update(updatePayload)
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/maquinas/${maquinaId}`);
  return { ok: true, message: "Tolva actualizada." };
}
