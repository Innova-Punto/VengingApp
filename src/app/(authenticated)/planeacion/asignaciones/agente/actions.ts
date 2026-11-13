"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { correrPropuesta } from "@/lib/ruteo/correr";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion", "planeador"] as const;

function volver(error?: string): never {
  redirect(
    error
      ? `/planeacion/asignaciones/agente?error=${encodeURIComponent(error)}`
      : "/planeacion/asignaciones/agente",
  );
}

/** Corrida a mano, para cuando Mariana quiere una propuesta fuera del cron. */
export async function generarPropuesta() {
  const user = await requireRole(...ROLES);
  try {
    await correrPropuesta({ fuente: "manual", generadaPor: user.id });
  } catch (e) {
    volver(e instanceof Error ? e.message : String(e));
  }
  revalidatePath("/planeacion/asignaciones/agente");
  volver();
}

/**
 * Convierte la propuesta en asignaciones reales.
 *
 * El orden que propuso el agente se guarda en `orden_sugerido` y el motivo de
 * cada parada en `justificacion`: si Mariana después reordena a mano, se puede
 * ver qué proponía el agente y qué prefirió ella. Esa diferencia es la que va a
 * decir, con el tiempo, si el agente sirve.
 */
export async function aceptarPropuesta(formData: FormData) {
  await requireRole(...ROLES);
  const propuestaId = String(formData.get("propuesta_id") ?? "");
  if (!propuestaId) volver("Falta la propuesta.");

  const supabase = createClient();

  // La fecha se lee aparte solo para el redirect de salida. Las validaciones
  // —que exista, que siga en "generada"— las hace el RPC con la propuesta
  // bloqueada, que es donde sirven: comprobarlas aquí antes de llamar sería
  // mirar el semáforo y cruzar diez segundos después.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propuesta } = await (supabase as any)
    .from("propuestas_ruteo")
    .select("fecha")
    .eq("id", propuestaId)
    .maybeSingle();

  // Todo el trabajo vive en `aceptar_propuesta_ruteo`, en una sola
  // transacción. Antes esto era un `for` que insertaba de a una: si la cuarta
  // ruta chocaba, las tres primeras ya estaban escritas y la propuesta seguía
  // sin aceptar, sin forma de volver atrás más que borrando a mano. Lo mismo
  // que nos pasó con los surtidos (migración 20261005184113).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("aceptar_propuesta_ruteo", {
    p_propuesta_id: propuestaId,
  });

  if (error) volver(error.message);

  revalidatePath("/planeacion/asignaciones");
  revalidatePath("/planeacion/asignaciones/agente");
  redirect(
    propuesta?.fecha
      ? `/planeacion/asignaciones?fecha=${propuesta.fecha}`
      : "/planeacion/asignaciones",
  );
}

/**
 * Descartar exige motivo. No es burocracia: ese texto es la única
 * retroalimentación que vamos a tener sobre por qué el agente no sirvió ese
 * día, y sin él en tres meses nadie va a saber si vale la pena mantenerlo.
 */
export async function descartarPropuesta(formData: FormData) {
  const user = await requireRole(...ROLES);
  const propuestaId = String(formData.get("propuesta_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!propuestaId) volver("Falta la propuesta.");
  if (!motivo) volver("Escribe por qué no te sirvió la propuesta.");

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("propuestas_ruteo")
    .update({
      estado: "descartada",
      motivo_descarte: motivo,
      decidida_por: user.id,
      decidida_at: new Date().toISOString(),
    })
    .eq("id", propuestaId)
    .eq("estado", "generada");

  if (error) volver(error.message);

  revalidatePath("/planeacion/asignaciones/agente");
  volver();
}
