import { Logo } from "@/components/Logo";

import LoginForm from "./LoginForm";

export const metadata = {
  title: "Iniciar sesión · Innovaypunto",
};

type SearchParams = {
  next?: string;
  error?: string;
  reason?: string;
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const next = searchParams.next ?? "/";
  const initialError =
    searchParams.error ||
    (searchParams.reason === "inactivo"
      ? "Tu cuenta está desactivada. Contacta al administrador."
      : undefined);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-dark p-6">
      {/* Glow decorativo */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-brand/40 blur-3xl" />

      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo size="xl" variant="default" showTagline={true} />
        </div>

        <div className="space-y-5 rounded-2xl border border-white/10 bg-white/95 p-8 shadow-2xl backdrop-blur-sm">
          <div className="space-y-1 text-center">
            <h1 className="text-lg font-semibold text-brand tracking-tight">
              Plataforma de vending
            </h1>
            <p className="text-sm text-zinc-600">Inicia sesión para continuar</p>
          </div>

          <LoginForm next={next} initialError={initialError} />

          <p className="text-center text-xs text-zinc-500">
            ¿Problemas para entrar? Contacta a tu administrador.
          </p>
        </div>

        <p className="text-center text-[10px] text-white/40 tracking-widest">
          © {new Date().getFullYear()} INNOVAYPUNTO
        </p>
      </div>
    </main>
  );
}
