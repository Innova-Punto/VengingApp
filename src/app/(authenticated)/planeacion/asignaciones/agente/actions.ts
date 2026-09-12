"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { correrPropuesta } from "@/lib/ruteo/correr";
import type { PlanRuta } from "@/lib/ruteo/correr";
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
  const user = await requireRole(...ROLES);
  const propuestaId = String(formData.get("propuesta_id") ?? "");
  if (!propuestaId) volver("Falta la propuesta.");

  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propuesta } = await (supabase as any)
    .from("propuestas_ruteo")
    .select("id, fecha, estado, plan")
    .eq("id", propuestaId)
    .maybeSingle();

  if (!propuesta) volver("No se encontró la propuesta.");
  if (propuesta.estado !== "generada") {
    volver(`Esta propuesta ya está ${propuesta.estado}.`);
  }

  const plan = (propuesta.plan ?? []) as PlanRuta[];
  if (plan.length === 0) volver("La propuesta no trae rutas.");

  const creadas: string[] = [];

  for (const ruta of plan) {
    if (ruta.paradas.length === 0) continue;
    const maquinaIds = ruta.paradas.map((p) => p.maquina_id);

    // La ruta de la asignación es la más representada entre las máquinas
    // elegidas: el modelo de datos exige `ruta_id` y única por fecha.
    const { data: rutasDe } = await supabase
      .from("ruta_maquinas")
      .select("ruta_id, ruta:rutas(id, nombre, activa)")
      .in("maquina_id", maquinaIds);

    const conteo = new Map<string, { n: number; nombre: string }>();
    for (const rm of rutasDe ?? []) {
      const r = Array.isArray(rm.ruta) ? rm.ruta[0] : rm.ruta;
      if (!r?.activa) continue;
      const prev = conteo.get(rm.ruta_id) ?? { n: 0, nombre: r.nombre };
      conteo.set(rm.ruta_id, { n: prev.n + 1, nombre: r.nombre });
    }
    const ganadora = Array.from(conteo.entries()).sort((a, b) => b[1].n - a[1].n)[0];
    if (!ganadora) {
      volver(
        `Las máquinas de ${ruta.operador_nombre} no pertenecen a ninguna ruta activa.`,
      );
    }

    const { data: asig, error } = await supabase
      .from("asignaciones_diarias")
      .insert({
        fecha: propuesta.fecha,
        ruta_id: ganadora[0],
        operador_id: ruta.operador_id,
        notas: `Propuesta del agente de ruteo · ${ruta.paradas.length} paradas · ${ruta.km_total} km · ${ruta.horas_estimadas} h estimadas`,
        creado_por: user.id,
        estado: "planeada",
      })
      .select("id")
      .single();

    if (error || !asig) {
      if (error?.code === "23505") {
        volver(
          `La ruta ${ganadora[1].nombre} ya tiene asignación el ${propuesta.fecha}. Cancélala primero. (Se crearon ${creadas.length} antes de este error.)`,
        );
      }
      volver(error?.message ?? "Error al crear la asignación.");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any)
      .from("asignacion_maquinas")
      .insert(
        ruta.paradas.map((p) => ({
          asignacion_id: asig.id,
          maquina_id: p.maquina_id,
          orden: p.orden,
          orden_sugerido: p.orden,
          justificacion: p.motivo,
          origen: "agente",
        })),
      );
    if (insErr) {
      volver(`Asignación creada pero al copiar máquinas: ${insErr.message}`);
    }
    creadas.push(asig.id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("propuestas_ruteo")
    .update({
      estado: "aceptada",
      decidida_por: user.id,
      decidida_at: new Date().toISOString(),
    })
    .eq("id", propuestaId);

  revalidatePath("/planeacion/asignaciones");
  revalidatePath("/planeacion/asignaciones/agente");
  redirect(`/planeacion/asignaciones?fecha=${propuesta.fecha}`);
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
