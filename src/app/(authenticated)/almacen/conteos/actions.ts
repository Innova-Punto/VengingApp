"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function iniciarConteo(formData: FormData): Promise<void> {
  await requireRole("admin", "direccion", "almacen");
  const cierreId = String(formData.get("cierre_id") ?? "");
  if (!cierreId) {
    redirect("/almacen/conteos?error=" + encodeURIComponent("Falta cierre."));
  }

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  const { data, error } = await supabaseAny.rpc("iniciar_conteo_almacen", {
    p_cierre_id: cierreId,
  });
  if (error) {
    redirect("/almacen/conteos?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/almacen/conteos");
  redirect(`/almacen/conteos/${data}`);
}

export async function aplicarConteo(input: {
  conteoId: string;
  granel: { id: string; gramos_fisicos: number }[];
  cartuchos: { id: string; cantidad_fisica: number }[];
}): Promise<ActionResult> {
  await requireRole("admin", "direccion", "almacen");

  if (!input.conteoId) return { ok: false, message: "Falta conteo." };

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  const { error } = await supabaseAny.rpc("aplicar_conteo_almacen", {
    p_conteo_id: input.conteoId,
    p_granel: input.granel,
    p_cartuchos: input.cartuchos,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/almacen/conteos");
  revalidatePath(`/almacen/conteos/${input.conteoId}`);
  return { ok: true, message: "Conteo aplicado. Diferencias registradas." };
}
