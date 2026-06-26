import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

import { actualizarRoles, toggleActivo } from "./actions";

type AppRole = Database["public"]["Enums"]["app_role"];

const ALL_ROLES: AppRole[] = [
  "direccion",
  "compras",
  "almacen",
  "planeador",
  "operador",
  "admin",
];

export const metadata = { title: "Usuarios · Innovaypunto" };

export default async function UsuariosPage() {
  await requireRole("admin", "direccion");

  const supabase = createClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, activo, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }

  const { data: rolesRows } = await supabase
    .from("user_roles")
    .select("user_id, role");

  const rolesByUser = new Map<string, AppRole[]>();
  (rolesRows ?? []).forEach((r) => {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r.role);
    rolesByUser.set(r.user_id, arr);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-sm text-zinc-600">
            Administra cuentas y roles de acceso a MuscleUp.
          </p>
        </div>
        <Link
          href="/admin/usuarios/nuevo"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
        >
          Invitar usuario
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Roles</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(profiles ?? []).map((p) => {
              const currentRoles = rolesByUser.get(p.id) ?? [];
              return (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {p.full_name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {p.email ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <form
                      action={actualizarRoles}
                      className="flex flex-wrap gap-2"
                    >
                      <input type="hidden" name="user_id" value={p.id} />
                      {ALL_ROLES.map((r) => (
                        <label
                          key={r}
                          className="flex items-center gap-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            name="roles"
                            value={r}
                            defaultChecked={currentRoles.includes(r)}
                          />
                          <span>{r}</span>
                        </label>
                      ))}
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Guardar
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.activo
                          ? "bg-green-100 text-green-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={toggleActivo} className="inline">
                      <input type="hidden" name="user_id" value={p.id} />
                      <input
                        type="hidden"
                        name="activo"
                        value={p.activo ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                      >
                        {p.activo ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(profiles ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No hay usuarios todavía. Invita al primero.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
