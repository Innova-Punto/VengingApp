"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function iniciarJornada(input: {
  asignacionId: string;
  lat: number | null;
  lng: number | null;
}): Promise<ActionResult> {
  await requireRole("operador", "admin", "direccion");

  if (!input.asignacionId) {
    return { ok: false, message: "Falta asignación." };
  }

  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  const { error } = await supabaseAny.rpc("op_iniciar_jornada", {
    p_asignacion_id: input.asignacionId,
    p_lat: input.lat,
    p_lng: input.lng,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/campo");
  revalidatePath(`/campo/jornada/${input.asignacionId}`);
  return { ok: true, message: "Jornada iniciada." };
}
