import LoginForm from "./LoginForm";

export const metadata = {
  title: "Iniciar sesión · MuscleUp",
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
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">MuscleUp</h1>
          <p className="text-sm text-zinc-600">Inicia sesión para continuar</p>
        </div>

        <LoginForm next={next} initialError={initialError} />

        <p className="text-center text-xs text-zinc-500">
          ¿Problemas para entrar? Contacta a tu administrador.
        </p>
      </div>
    </main>
  );
}
