"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion", "planeador"] as const;

export type CampanaResult = { ok: false; message: string } | { ok: true };

export type IngredienteCampana = {
  tolva_numero: number;
  /** Null = la bebida no usaba esa tolva: el ingrediente es nuevo. */
  gramos_anteriores: number | null;
  /** Null = el ingrediente sale de la bebida. */
  gramos_nuevos: number | null;
};

export type BebidaCampana = {
  receta_item_id: string;
  nombre_anterior: string;
  precio_anterior: number | null;
  gramos_anteriores: number | null;
  nombre_nuevo: string;
  precio_nuevo: number | null;
  gramos_nuevos: number | null;
  /** La receta completa que va a quedar, no solo la tolva sustituida. */
  ingredientes: IngredienteCampana[];
};

/**
 * Arma la campaña completa en un solo acto: la campaña, las bebidas que
 * cambian de nombre, y la sustitución pendiente en cada máquina.
 *
 * Todo junto y no por partes: una campaña sin sus sustituciones es una
 * intención, y unas sustituciones sin campaña son lo que ya teníamos — el
 * polvo cambia y el menú se queda mintiendo.
 */
export async function crearCampana(input: {
  nombre: string;
  recetaId: string;
  tolvaNumero: number;
  productoSalienteId: string;
  productoEntranteId: string;
  maquinaIds: string[];
  bebidas: BebidaCampana[];
  notas: string | null;
}): Promise<CampanaResult> {
  const user = await requireRole(...ROLES);

  if (!input.nombre.trim()) return { ok: false, message: "Ponle nombre a la campaña." };
  if (!input.productoEntranteId) return { ok: false, message: "Elige el producto que entra." };
  if (input.productoSalienteId === input.productoEntranteId) {
    return { ok: false, message: "El producto que entra es el mismo que sale." };
  }
  if (input.maquinaIds.length === 0) {
    return { ok: false, message: "No hay máquinas con ese producto en esa tolva." };
  }
  if (input.bebidas.length === 0) {
    return {
      ok: false,
      message:
        "Ninguna bebida cambia de nombre. Si el sabor no se llama distinto, usa la sustitución normal en vez de una campaña.",
    };
  }
  if (input.bebidas.some((b) => !b.nombre_nuevo.trim())) {
    return { ok: false, message: "Falta el nombre nuevo de alguna bebida." };
  }

  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data: campana, error } = await sb
    .from("campanas_temporada")
    .insert({
      nombre: input.nombre.trim(),
      receta_id: input.recetaId,
      tolva_numero: input.tolvaNumero,
      producto_saliente_id: input.productoSalienteId,
      producto_entrante_id: input.productoEntranteId,
      notas: input.notas,
      creado_por: user.id,
    })
    .select("id")
    .single();

  if (error || !campana) {
    return { ok: false, message: error?.message ?? "No se pudo crear la campaña." };
  }

  const { data: bebidasCreadas, error: errBebidas } = await sb
    .from("campana_bebidas")
    .insert(
      input.bebidas.map((b) => ({
        campana_id: campana.id,
        receta_item_id: b.receta_item_id,
        nombre_anterior: b.nombre_anterior,
        precio_anterior: b.precio_anterior,
        gramos_anteriores: b.gramos_anteriores,
        nombre_nuevo: b.nombre_nuevo.trim(),
        precio_nuevo: b.precio_nuevo,
        gramos_nuevos: b.gramos_nuevos,
      })),
    )
    .select("id, receta_item_id");
  if (errBebidas) {
    return { ok: false, message: `Campaña creada, pero las bebidas: ${errBebidas.message}` };
  }

  // La receta completa que va a quedar. Solo se guardan los ingredientes que
  // de verdad cambian: los que siguen igual no tienen por qué reescribirse.
  const idPorItem = new Map<string, string>(
    (bebidasCreadas ?? []).map((b: { id: string; receta_item_id: string }) => [
      b.receta_item_id,
      b.id,
    ]),
  );
  const ingredientes = input.bebidas.flatMap((b) =>
    (b.ingredientes ?? [])
      .filter((i) => i.gramos_anteriores !== i.gramos_nuevos)
      .map((i) => ({
        campana_bebida_id: idPorItem.get(b.receta_item_id)!,
        tolva_numero: i.tolva_numero,
        gramos_anteriores: i.gramos_anteriores,
        gramos_nuevos: i.gramos_nuevos,
      })),
  );

  if (ingredientes.length > 0) {
    const { error: errIng } = await sb
      .from("campana_bebida_ingredientes")
      .insert(ingredientes);
    if (errIng) {
      return { ok: false, message: `Campaña creada, pero la receta: ${errIng.message}` };
    }
  }

  // Una sustitución pendiente por máquina. El operador las ejecuta en campo,
  // igual que cualquier otra; la diferencia es que estas cierran la campaña.
  const { data: tolvas } = await sb
    .from("tolvas")
    .select("id, maquina_id, producto_id")
    .in("maquina_id", input.maquinaIds)
    .eq("numero", input.tolvaNumero);

  const filas = (tolvas ?? [])
    .filter((t: { producto_id: string | null }) => t.producto_id === input.productoSalienteId)
    .map((t: { id: string; maquina_id: string }) => ({
      tolva_id: t.id,
      maquina_id: t.maquina_id,
      producto_saliente_id: input.productoSalienteId,
      producto_entrante_id: input.productoEntranteId,
      estado: "pendiente",
      campana_id: campana.id,
      motivo: `Campaña de temporada: ${input.nombre.trim()}`,
      creado_por: user.id,
    }));

  if (filas.length === 0) {
    return {
      ok: false,
      message:
        "Campaña creada pero sin máquinas: ninguna tiene ese producto en esa tolva. Cancélala y vuelve a armarla.",
    };
  }

  const { error: errSust } = await sb.from("sustituciones_tolva").insert(filas);
  if (errSust) {
    return { ok: false, message: `Campaña creada, pero las sustituciones: ${errSust.message}` };
  }

  revalidatePath("/planeacion/campanas");
  revalidatePath("/planeacion/sustituciones");
  redirect("/planeacion/campanas");
}

/**
 * Aplica la campaña sin esperar a la última máquina.
 *
 * Existe para el caso en que una máquina se queda atrás —descompuesta, o fuera
 * de ruta— y dirección decide que el menú ya debe decir el nombre nuevo. Es una
 * decisión con costo: la máquina rezagada va a vender el nombre nuevo sirviendo
 * el sabor viejo hasta que alguien vaya. Por eso es un botón aparte y no el
 * camino normal.
 */
export async function aplicarCampanaAhora(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("campana_id") ?? "");
  if (!id) redirect("/planeacion/campanas");

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("aplicar_campana_temporada", {
    p_campana_id: id,
  });

  revalidatePath("/planeacion/campanas");
  redirect(
    error
      ? `/planeacion/campanas?error=${encodeURIComponent(error.message)}`
      : "/planeacion/campanas",
  );
}

export async function cancelarCampana(formData: FormData) {
  const user = await requireRole(...ROLES);
  const id = String(formData.get("campana_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!id) redirect("/planeacion/campanas");
  if (!motivo) {
    redirect("/planeacion/campanas?error=" + encodeURIComponent("Escribe por qué se cancela."));
  }

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // Las sustituciones que nadie ejecutó se cancelan con la campaña. Las que ya
  // se ejecutaron se quedan: el polvo ya se cambió en esa máquina y borrar el
  // registro sería mentir sobre lo que hay dentro.
  await sb
    .from("sustituciones_tolva")
    .update({ estado: "cancelada", cancelada_at: new Date().toISOString() })
    .eq("campana_id", id)
    .eq("estado", "pendiente");

  await sb
    .from("campanas_temporada")
    .update({
      estado: "cancelada",
      motivo_cancelacion: motivo,
      cancelada_at: new Date().toISOString(),
      cancelada_por: user.id,
    })
    .eq("id", id)
    .eq("estado", "programada");

  revalidatePath("/planeacion/campanas");
  redirect("/planeacion/campanas");
}
