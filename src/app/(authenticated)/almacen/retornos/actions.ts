"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion", "almacen"] as const;

export type RetornoResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Almacén inspecciona el polvo que llegó de una sustitución.
 *  - Aceptado → nace un LOTE recuperado (separado del virgen) con los gramos
 *    confirmados y el costo que traía de la tolva.
 *  - Rechazado → se registra como merma; no se crea lote.
 */
export async function recibirRetorno(input: {
  sustitucionId: string;
  aceptado: boolean;
  gramosRecibidos: number | null;
  motivoRechazo: string | null;
  fechaCaducidad: string | null;
}): Promise<RetornoResult> {
  await requireRole(...ROLES);

  if (!input.sustitucionId) return { ok: false, message: "Falta el retorno." };
  if (input.aceptado) {
    if (
      input.gramosRecibidos == null ||
      !Number.isFinite(input.gramosRecibidos) ||
      input.gramosRecibidos <= 0
    ) {
      return {
        ok: false,
        message: "Captura los gramos recibidos (mayor a 0) o rechaza el retorno.",
      };
    }
  } else if (!input.motivoRechazo?.trim()) {
    return { ok: false, message: "Indica por qué se rechaza el polvo." };
  }

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("recibir_retorno_polvo", {
    p_sustitucion_id: input.sustitucionId,
    p_aceptado: input.aceptado,
    p_gramos_recibidos: input.aceptado
      ? Math.round(input.gramosRecibidos as number)
      : null,
    p_motivo_rechazo: input.aceptado ? null : input.motivoRechazo,
    p_fecha_caducidad: input.aceptado ? input.fechaCaducidad : null,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/almacen/retornos");
  revalidatePath("/almacen/lotes");
  revalidatePath("/almacen/inventario");
  revalidatePath("/planeacion/sustituciones");

  return {
    ok: true,
    message: input.aceptado
      ? "Polvo recibido. Se creó un lote recuperado listo para encartuchar."
      : "Retorno rechazado y registrado como merma.",
  };
}
