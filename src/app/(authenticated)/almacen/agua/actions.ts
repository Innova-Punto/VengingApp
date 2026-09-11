"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion", "almacen", "planeador"] as const;

function volver(error?: string): never {
  redirect(error ? `/almacen/agua?error=${encodeURIComponent(error)}` : "/almacen/agua");
}

function entero(v: FormDataEntryValue | null, min = 1): number | null {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n < min) return null;
  return Math.trunc(n);
}

/** Llegaron garrafones al CEDIS. */
export async function registrarEntrada(formData: FormData) {
  const user = await requireRole(...ROLES);

  const garrafones = entero(formData.get("garrafones"));
  if (garrafones === null) volver("¿Cuántos garrafones entraron?");

  const costoRaw = String(formData.get("costo_referencia") ?? "").trim();
  const costo = costoRaw === "" ? null : Number(costoRaw);
  if (costo !== null && (!Number.isFinite(costo) || costo < 0)) {
    volver("El costo no es un número válido.");
  }

  const supabase = createClient();
  const { error } = await supabase.from("agua_almacen_movimientos").insert({
    tipo: "entrada_compra",
    garrafones,
    // Informativo: no se suma a ningún costo ni entra a los cierres. Se guarda
    // para que, si algún día se decide costear el agua, el histórico ya exista.
    costo_referencia: costo,
    proveedor_texto: String(formData.get("proveedor_texto") ?? "").trim() || null,
    nota: String(formData.get("nota") ?? "").trim() || null,
    created_by: user.id,
  });
  if (error) volver(error.message);

  revalidatePath("/almacen/agua");
  volver();
}

/** Salen garrafones a la camioneta. Se guardan en negativo. */
export async function registrarSalidaRuta(formData: FormData) {
  const user = await requireRole(...ROLES);

  const garrafones = entero(formData.get("garrafones"));
  if (garrafones === null) volver("¿Cuántos garrafones salieron?");

  const asignacionId = String(formData.get("asignacion_id") ?? "").trim() || null;

  const supabase = createClient();

  // La existencia no puede quedar negativa: si pasa, es que faltan entradas
  // por capturar y hay que arreglar eso, no dejar el saldo en rojo.
  const { data: saldo } = await supabase
    .from("v_agua_almacen")
    .select("existencia_garrafones")
    .maybeSingle();
  const disponible = saldo?.existencia_garrafones ?? 0;
  if (garrafones > disponible) {
    volver(
      `Solo hay ${disponible} garrafones registrados en almacén y quieres sacar ${garrafones}. Captura primero la entrada que falte.`,
    );
  }

  const { error } = await supabase.from("agua_almacen_movimientos").insert({
    tipo: "salida_ruta",
    garrafones: -garrafones,
    asignacion_id: asignacionId,
    operador_id: String(formData.get("operador_id") ?? "").trim() || null,
    nota: String(formData.get("nota") ?? "").trim() || null,
    created_by: user.id,
  });
  if (error) volver(error.message);

  revalidatePath("/almacen/agua");
  volver();
}

/** Regresaron garrafones que no se usaron. */
export async function registrarRetorno(formData: FormData) {
  const user = await requireRole(...ROLES);

  const garrafones = entero(formData.get("garrafones"));
  if (garrafones === null) volver("¿Cuántos garrafones regresaron?");

  const supabase = createClient();
  const { error } = await supabase.from("agua_almacen_movimientos").insert({
    tipo: "retorno_ruta",
    garrafones,
    asignacion_id: String(formData.get("asignacion_id") ?? "").trim() || null,
    nota: String(formData.get("nota") ?? "").trim() || null,
    created_by: user.id,
  });
  if (error) volver(error.message);

  revalidatePath("/almacen/agua");
  volver();
}

/** Se rompió o se derramó. Exige explicación. */
export async function registrarMerma(formData: FormData) {
  const user = await requireRole(...ROLES);

  const garrafones = entero(formData.get("garrafones"));
  if (garrafones === null) volver("¿Cuántos garrafones se perdieron?");

  const nota = String(formData.get("nota") ?? "").trim();
  if (!nota) volver("Escribe qué pasó con esos garrafones.");

  const supabase = createClient();
  const { error } = await supabase.from("agua_almacen_movimientos").insert({
    tipo: "merma",
    garrafones: -garrafones,
    nota,
    created_by: user.id,
  });
  if (error) volver(error.message);

  revalidatePath("/almacen/agua");
  volver();
}

/**
 * Conteo físico: se captura lo que hay y el sistema calcula el ajuste.
 * Si coincide con el saldo no escribe nada — un movimiento de cero no dice
 * nada y sí ensucia la bitácora.
 */
export async function ajustarPorConteo(formData: FormData) {
  const user = await requireRole(...ROLES);

  const contados = entero(formData.get("contados"), 0);
  if (contados === null) volver("¿Cuántos garrafones contaste?");

  const supabase = createClient();
  const { data: saldo } = await supabase
    .from("v_agua_almacen")
    .select("existencia_garrafones")
    .maybeSingle();
  const registrados = saldo?.existencia_garrafones ?? 0;
  const diferencia = contados - registrados;

  if (diferencia === 0) {
    revalidatePath("/almacen/agua");
    volver();
  }

  const { error } = await supabase.from("agua_almacen_movimientos").insert({
    tipo: "ajuste_conteo",
    garrafones: diferencia,
    nota:
      `Conteo físico: ${contados} contados contra ${registrados} registrados.` +
      (String(formData.get("nota") ?? "").trim()
        ? ` ${String(formData.get("nota")).trim()}`
        : ""),
    created_by: user.id,
  });
  if (error) volver(error.message);

  revalidatePath("/almacen/agua");
  volver();
}
