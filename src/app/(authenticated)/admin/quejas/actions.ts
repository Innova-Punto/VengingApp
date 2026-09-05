"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { seudonimizarTelefono, validarTelefono10 } from "@/lib/quejas/telefono";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type QuejaTipo = Database["public"]["Enums"]["queja_tipo"];
type QuejaCanal = Database["public"]["Enums"]["queja_canal"];
type ContactoResultado =
  Database["public"]["Enums"]["queja_contacto_resultado"];

const GESTION = ["admin", "direccion", "planeador"] as const;

export type QuejaResult = { ok: false; message: string } | { ok: true };

// ============================================================================
// Captura
// ============================================================================

export async function crearQueja(
  _prev: QuejaResult | null,
  formData: FormData,
): Promise<QuejaResult> {
  const actual = await requireRole(...GESTION);

  const telefono = String(formData.get("telefono") ?? "");
  const errTel = validarTelefono10(telefono);
  if (errTel) return { ok: false, message: errTel };

  // El número completo se usa aquí y se descarta: a la base solo van el hash y
  // los últimos 4. Nunca lo mandes a un log.
  let seudo;
  try {
    seudo = seudonimizarTelefono(telefono);
  } catch {
    return {
      ok: false,
      message:
        "Falta configurar QUEJAS_TELEFONO_SALT en el entorno. Sin esa variable no se puede guardar la queja.",
    };
  }
  if (!seudo) return { ok: false, message: "El teléfono no es válido." };

  const maquinaId = String(formData.get("maquina_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "") as QuejaTipo;
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const montoRaw = String(formData.get("monto_reclamado") ?? "").trim();

  if (!maquinaId) return { ok: false, message: "Selecciona la máquina." };
  if (!tipo) return { ok: false, message: "Selecciona el tipo de queja." };
  if (tipo === "otro" && !descripcion) {
    return {
      ok: false,
      message: "Si el tipo es «Otro», describe qué pasó.",
    };
  }

  let monto: number | null = null;
  if (montoRaw) {
    const n = Number(montoRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, message: "El monto reclamado no es un número válido." };
    }
    monto = n;
  }

  const supabase = createClient();

  // El operador se deduce de quién atiende esa máquina: no se captura a mano,
  // que es de donde salían los "GUILLEMRO" y "JONTAHAN" del Excel.
  const { data: rutaMaq } = await supabase
    .from("ruta_maquinas")
    .select("ruta:rutas(operador_titular_id, activa)")
    .eq("maquina_id", maquinaId)
    .limit(5);
  const operadorId =
    (rutaMaq ?? [])
      .map((r) => (Array.isArray(r.ruta) ? r.ruta[0] : r.ruta))
      .find((r) => r?.activa)?.operador_titular_id ?? null;

  const { error } = await supabase.from("quejas").insert({
    telefono_ultimos4: seudo.ultimos4,
    telefono_hash: seudo.hash,
    maquina_id: maquinaId,
    tipo,
    descripcion,
    monto_reclamado: monto,
    operador_id: operadorId,
    created_by: actual.id,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/quejas");
  redirect("/admin/quejas");
}

// ============================================================================
// Bitácora de toques
// ============================================================================

export async function registrarContacto(formData: FormData) {
  const actual = await requireRole(...GESTION);

  const quejaId = String(formData.get("queja_id") ?? "");
  const canal = String(formData.get("canal") ?? "whatsapp") as QuejaCanal;
  const resultado = String(formData.get("resultado") ?? "") as ContactoResultado;
  const nota = String(formData.get("nota") ?? "").trim() || null;
  if (!quejaId || !resultado) redirect("/admin/quejas");

  const supabase = createClient();
  await supabase.from("queja_contactos").insert({
    queja_id: quejaId,
    canal,
    resultado,
    nota,
    registrado_por: actual.id,
  });

  // Un toque en el que el usuario pide algo deja la queja esperándolo a él, no
  // a nosotros. Es la distinción que en el Excel se perdía en una sola columna.
  if (resultado === "pendiente_info") {
    await supabase
      .from("quejas")
      .update({ estado: "espera_cliente" })
      .eq("id", quejaId)
      .in("estado", ["abierta", "en_validacion"]);
  }

  revalidatePath(`/admin/quejas/${quejaId}`);
  redirect(`/admin/quejas/${quejaId}`);
}

// ============================================================================
// Validación, autorización y pago
// ============================================================================

export async function validarQueja(formData: FormData) {
  const actual = await requireRole(...GESTION, "operador");

  const quejaId = String(formData.get("queja_id") ?? "");
  const procede = formData.get("procede") === "true";
  const motivo = String(formData.get("motivo_no_procede") ?? "").trim() || null;
  if (!quejaId) redirect("/admin/quejas");

  if (!procede && !motivo) {
    redirect(`/admin/quejas/${quejaId}?error=motivo_requerido`);
  }

  const supabase = createClient();
  await supabase
    .from("quejas")
    .update({
      procede,
      motivo_no_procede: procede ? null : motivo,
      validada_por: actual.id,
      fecha_validacion: new Date().toISOString(),
      estado: procede ? "procede" : "no_procede",
    })
    .eq("id", quejaId);

  revalidatePath(`/admin/quejas/${quejaId}`);
  redirect(`/admin/quejas/${quejaId}`);
}

export async function autorizarMonto(formData: FormData) {
  await requireRole(...GESTION);

  const quejaId = String(formData.get("queja_id") ?? "");
  const montoRaw = String(formData.get("monto_autorizado") ?? "").trim();
  if (!quejaId) redirect("/admin/quejas");

  const monto = Number(montoRaw);
  if (!Number.isFinite(monto) || monto < 0) {
    redirect(`/admin/quejas/${quejaId}?error=monto_invalido`);
  }

  const supabase = createClient();
  await supabase
    .from("quejas")
    .update({ monto_autorizado: monto })
    .eq("id", quejaId);

  revalidatePath(`/admin/quejas/${quejaId}`);
  redirect(`/admin/quejas/${quejaId}`);
}

export async function registrarPago(formData: FormData) {
  const actual = await requireRole(...GESTION);

  const quejaId = String(formData.get("queja_id") ?? "");
  const comprobanteUrl = String(formData.get("comprobante_url") ?? "").trim();
  if (!quejaId) redirect("/admin/quejas");
  if (!comprobanteUrl) {
    redirect(`/admin/quejas/${quejaId}?error=comprobante_requerido`);
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("quejas")
    .update({
      estado: "pagada",
      comprobante_url: comprobanteUrl,
      fecha_pago: new Date().toISOString(),
      pagada_por: actual.id,
    })
    .eq("id", quejaId);
  if (error) redirect(`/admin/quejas/${quejaId}?error=pago`);

  revalidatePath(`/admin/quejas/${quejaId}`);
  redirect(`/admin/quejas/${quejaId}`);
}

export async function registrarRecuperacion(formData: FormData) {
  await requireRole(...GESTION, "operador");

  const quejaId = String(formData.get("queja_id") ?? "");
  if (!quejaId) redirect("/admin/quejas");

  const supabase = createClient();
  await supabase
    .from("quejas")
    .update({
      recuperado: true,
      fecha_entrega_dinero: new Date().toISOString(),
    })
    .eq("id", quejaId);

  revalidatePath(`/admin/quejas/${quejaId}`);
  redirect(`/admin/quejas/${quejaId}`);
}

// ============================================================================
// Cierre
// ============================================================================

export async function cerrarQueja(formData: FormData) {
  await requireRole(...GESTION);

  const quejaId = String(formData.get("queja_id") ?? "");
  const motivo = String(formData.get("motivo") ?? ""); // resuelta | sin_respuesta
  const notas = String(formData.get("notas_cierre") ?? "").trim() || null;
  if (!quejaId) redirect("/admin/quejas");

  const supabase = createClient();

  // Cerrar por falta de respuesta exige tener con qué sostenerlo: sin bitácora
  // de toques no hay evidencia ante el cliente ni ante dirección.
  if (motivo === "sin_respuesta") {
    const { count } = await supabase
      .from("queja_contactos")
      .select("id", { count: "exact", head: true })
      .eq("queja_id", quejaId);
    if ((count ?? 0) === 0) {
      redirect(`/admin/quejas/${quejaId}?error=sin_toques`);
    }
  }

  await supabase
    .from("quejas")
    .update({
      estado:
        motivo === "sin_respuesta"
          ? "cerrada_sin_respuesta"
          : "cerrada_resuelta",
      fecha_cierre: new Date().toISOString(),
      notas_cierre: notas,
    })
    .eq("id", quejaId);

  revalidatePath(`/admin/quejas/${quejaId}`);
  revalidatePath("/admin/quejas");
  redirect(`/admin/quejas/${quejaId}`);
}
