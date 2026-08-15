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
  "cliente",
];

export type InviteResult =
  | { ok: true; message: string; link?: string }
  | { ok: false; message: string };

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    `${headers().get("x-forwarded-proto") ?? "http"}://${headers().get("host") ?? "localhost:3000"}`
  );
}

async function asignarPerfilYRoles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  fullName: string,
  phone: string | null,
  roles: AppRole[],
  createdBy: string,
  clienteId: string | null,
): Promise<string | null> {
  await admin
    .from("profiles")
    .update({ full_name: fullName, phone, cliente_id: clienteId })
    .eq("id", userId);
  const rolesRows = roles.map((role) => ({
    user_id: userId,
    role,
    created_by: createdBy,
  }));
  const { error: rolesErr } = await admin.from("user_roles").insert(rolesRows);
  return rolesErr?.message ?? null;
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
  const soloLink = formData.get("solo_link") === "true";
  const clienteIdRaw = String(formData.get("cliente_id") ?? "").trim() || null;

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

  // El rol `cliente` es de solo lectura y vive fuera de la operación: se acota a
  // SU cliente vía profiles.cliente_id. Mezclarlo con un rol interno rompería el
  // acotamiento, porque user_es_interno() le abriría todas las lecturas.
  const esCliente = roles.includes("cliente");
  if (esCliente && roles.length > 1) {
    return {
      ok: false,
      message:
        "El rol Cliente no se puede combinar con roles internos: dale una cuenta aparte.",
    };
  }
  if (esCliente && !clienteIdRaw) {
    return { ok: false, message: "Selecciona a qué cliente pertenece." };
  }
  if (!esCliente && clienteIdRaw) {
    return {
      ok: false,
      message: "Solo un usuario con rol Cliente puede tener cliente asignado.",
    };
  }

  const admin = createAdminClient();

  if (esCliente && clienteIdRaw) {
    const { data: cliente, error: clienteErr } = await admin
      .from("clientes")
      .select("id, activo")
      .eq("id", clienteIdRaw)
      .maybeSingle();
    if (clienteErr || !cliente) {
      return { ok: false, message: "El cliente seleccionado no existe." };
    }
    if (!cliente.activo) {
      return { ok: false, message: "El cliente seleccionado está inactivo." };
    }
  }

  const redirectTo = `${appUrl()}/auth/callback?next=/set-password`;

  if (soloLink) {
    // Bypass SMTP: genera el link sin mandar correo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.auth.admin as any).generateLink({
      type: "invite",
      email,
      options: {
        data: { full_name: fullName, phone },
        redirectTo,
      },
    });
    if (error || !data?.user) {
      return {
        ok: false,
        message: error?.message ?? "No se pudo generar el link.",
      };
    }
    const rolesErr = await asignarPerfilYRoles(
      admin,
      data.user.id,
      fullName,
      phone,
      roles,
      current.id,
      clienteIdRaw,
    );
    if (rolesErr) return { ok: false, message: `Roles: ${rolesErr}` };

    revalidatePath("/admin/usuarios");
    return {
      ok: true,
      message:
        "Link generado (no se envió correo). Cópialo y compártelo manualmente.",
      link: data.properties?.action_link as string | undefined,
    };
  }

  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, phone },
      redirectTo,
    });

  if (inviteErr || !invited.user) {
    return {
      ok: false,
      message: inviteErr?.message ?? "No se pudo invitar al usuario.",
    };
  }

  const rolesErr = await asignarPerfilYRoles(
    admin,
    invited.user.id,
    fullName,
    phone,
    roles,
    current.id,
    clienteIdRaw,
  );
  if (rolesErr) return { ok: false, message: `Roles: ${rolesErr}` };

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

  // Mismo invariante que en la invitación: `cliente` es excluyente y exige
  // tener cliente asignado, o el usuario quedaría con lectura sin acotar.
  const esCliente = roles.includes("cliente");
  if (esCliente && roles.length > 1) {
    redirect("/admin/usuarios?error=cliente_no_combinable");
  }
  if (esCliente) {
    const { data: perfil } = await admin
      .from("profiles")
      .select("cliente_id")
      .eq("id", userId)
      .maybeSingle();
    if (!perfil?.cliente_id) {
      redirect("/admin/usuarios?error=cliente_sin_asignar");
    }
  } else {
    // Deja de ser cliente: se limpia el vínculo para no dejarlo colgando.
    await admin
      .from("profiles")
      .update({ cliente_id: null })
      .eq("id", userId);
  }

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
