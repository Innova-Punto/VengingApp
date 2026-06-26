import { requireUser } from "@/lib/auth";
import SetPasswordForm from "./SetPasswordForm";

export const metadata = {
  title: "Definir contraseña · Innovaypunto",
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  // Solo accesible con sesión activa (vienen del invite/magic link).
  await requireUser();

  const next = searchParams.next ?? "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Define tu contraseña
          </h1>
          <p className="text-sm text-zinc-600">
            Opcional. Puedes seguir usando magic link si lo prefieres.
          </p>
        </div>

        <SetPasswordForm next={next} />
      </div>
    </main>
  );
}
