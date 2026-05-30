import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { signOut } from "@/app/(auth)/login/actions";

export const metadata = { title: "Campo · MuscleUp" };

export default async function CampoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("operador", "admin", "direccion");

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/campo" className="text-base font-semibold tracking-tight">
            MuscleUp · Campo
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs leading-tight">
              <div className="font-medium text-zinc-900">{user.fullName}</div>
              <div className="text-zinc-500">operador</div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 active:bg-zinc-100"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4 pb-24">{children}</main>
    </div>
  );
}
