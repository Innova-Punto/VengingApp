"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function abrirCierre(formData: FormData): Promise<void> {
  await requireRole("admin", "direccion");
  const mes = Number(formData.get("mes") ?? 0);
  const anio = Number(formData.get("anio") ?? 0);

  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    redirect("/admin/cierres?error=" + encodeURIComponent("Mes inválido"));
  }
  if (!Number.isInteger(anio) || anio < 2024 || anio > 2100) {
    redirect("/admin/cierres?error=" + encodeURIComponent("Año inválido"));
  }

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  const { data, error } = await supabaseAny.rpc("abrir_cierre_mensual", {
    p_mes: mes,
    p_anio: anio,
  });
  if (error) {
    redirect("/admin/cierres?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/admin/cierres");
  redirect(`/admin/cierres/${data}`);
}
