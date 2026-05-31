import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { signOut } from "@/app/(auth)/login/actions";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Campo · Innovaypunto" };

export default async function CampoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("operador", "admin", "direccion");

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="sticky top-0 z-10 bg-brand text-white shadow-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/campo" className="flex items-center gap-2">
            <Logo size="sm" showTagline={false} />
            <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              Campo
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="text-right text-xs leading-tight">
              <div className="font-medium text-white">{user.fullName}</div>
              <div className="text-white/70">operador</div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white active:bg-white/20"
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
