"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type AppRole = Database["public"]["Enums"]["app_role"];

const VALID_ROLES: AppRole[] = [
  "direccion",
  "compras",
  "almacen",
  "planeador",
  "operador",
  "admin",
];

export type InviteResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    `${headers().get("x-forwarded-proto") ?? "http"}://${headers().get("host") ?? "localhost:3000"}`
  );
}

export async function invitarUsuario(
  _prev: InviteResult | null,
  formData: FormData,
): Promise<InviteResult> {
  const current = await requireRole("admin", "direccion");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const roles = formData.getAll("roles").map(String) as AppRole[];

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Email inválido." };
  }
  if (!fullName) {
    return { ok: false, message: "El nombre completo es obligatorio." };
  }
  if (roles.length === 0) {
    return { ok: false, message: "Selecciona al menos un rol." };
  }
  const invalid = roles.filter((r) => !VALID_ROLES.includes(r));
  if (invalid.length > 0) {
    return { ok: false, message: `Rol inválido: ${invalid.join(", ")}` };
  }

  const admin = createAdminClient();

  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, phone },
      redirectTo: `${appUrl()}/auth/callback?next=/set-password`,
    });

  if (inviteErr || !invited.user) {
    return {
      ok: false,
      message: inviteErr?.message ?? "No se pudo invitar al usuario.",
    };
  }

  // El trigger handle_new_auth_user ya creó el profile. Asegúrate de que
  // refleje el nombre/teléfono enviados (puede haber ganado el default).
  await admin
    .from("profiles")
    .update({ full_name: fullName, phone })
    .eq("id", invited.user.id);

  // Asigna roles.
  const rolesRows = roles.map((role) => ({
    user_id: invited.user!.id,
    role,
    created_by: current.id,
  }));
  const { error: rolesErr } = await admin.from("user_roles").insert(rolesRows);
  if (rolesErr) {
    return { ok: false, message: `Roles: ${rolesErr.message}` };
  }

  revalidatePath("/admin/usuarios");
  return { ok: true, message: `Invitación enviada a ${email}.` };
}

export async function actualizarRoles(formData: FormData) {
  const current = await requireRole("admin", "direccion");

  const userId = String(formData.get("user_id") ?? "");
  const roles = formData.getAll("roles").map(String) as AppRole[];

  if (!userId) redirect("/admin/usuarios");

  if (roles.some((r) => !VALID_ROLES.includes(r))) {
    redirect("/admin/usuarios?error=rol_invalido");
  }

  const admin = createAdminClient();

  // Reemplazo total: borrar y volver a insertar.
  await admin.from("user_roles").delete().eq("user_id", userId);

  if (roles.length > 0) {
    const rows = roles.map((role) => ({
      user_id: userId,
      role,
      created_by: current.id,
    }));
    await admin.from("user_roles").insert(rows);
  }

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}

export async function toggleActivo(formData: FormData) {
  await requireRole("admin", "direccion");

  const userId = String(formData.get("user_id") ?? "");
  const activo = formData.get("activo") === "true";

  if (!userId) redirect("/admin/usuarios");

  const admin = createAdminClient();
  await admin.from("profiles").update({ activo }).eq("id", userId);

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}
