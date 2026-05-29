"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SetPasswordResult = {
  ok: boolean;
  message: string;
};

export async function updatePassword(
  _prev: SetPasswordResult | null,
  formData: FormData,
): Promise<SetPasswordResult> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (password.length < 8) {
    return {
      ok: false,
      message: "La contraseña debe tener al menos 8 caracteres.",
    };
  }
  if (password !== confirm) {
    return { ok: false, message: "Las contraseñas no coinciden." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { ok: false, message: error.message };
  }

  redirect(next);
}

export async function skipPassword(formData: FormData) {
  const next = String(formData.get("next") ?? "/");
  redirect(next);
}
