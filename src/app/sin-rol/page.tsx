import { redirect } from "next/navigation";

import { getCurrentUser, homeForRoles } from "@/lib/auth";
import { signOut } from "@/app/(auth)/login/actions";

export const metadata = {
  title: "Sin rol asignado · MuscleUp",
};

export default async function SinRolPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Si ya tiene roles, mandarlo a su home.
  if (user.roles.length > 0 && searchParams.reason !== "forbidden") {
    redirect(homeForRoles(user.roles));
  }

  const title =
    searchParams.reason === "forbidden"
      ? "No tienes permiso para acceder a esa sección"
      : "Tu cuenta aún no tiene rol asignado";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-zinc-600">
            Hola {user.fullName}. Contacta a un administrador para que te
            asigne acceso a los módulos correspondientes.
          </p>
          {user.email && (
            <p className="text-xs text-zinc-500">
              Tu cuenta: <span className="font-mono">{user.email}</span>
            </p>
          )}
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
