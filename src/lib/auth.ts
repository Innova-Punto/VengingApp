import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  activo: boolean;
  roles: AppRole[];
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, phone, activo")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id),
  ]);

  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    phone: profile.phone,
    activo: profile.activo,
    roles: (roleRows ?? []).map((r) => r.role),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.activo) redirect("/login?reason=inactivo");
  return user;
}

export async function requireRole(
  ...allowed: AppRole[]
): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.roles.length === 0) redirect("/sin-rol");
  const hasAny = user.roles.some((r) => allowed.includes(r));
  if (!hasAny) redirect("/sin-rol?reason=forbidden");
  return user;
}

export function homeForRoles(roles: AppRole[]): string {
  if (roles.length === 0) return "/sin-rol";
  if (roles.includes("admin")) return "/admin/usuarios";
  if (roles.includes("direccion")) return "/admin/usuarios";
  if (roles.includes("compras")) return "/compras";
  if (roles.includes("almacen")) return "/almacen";
  if (roles.includes("planeador")) return "/admin/rutas";
  if (roles.includes("operador")) return "/campo";
  return "/sin-rol";
}
