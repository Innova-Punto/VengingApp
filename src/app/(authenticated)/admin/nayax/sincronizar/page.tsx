import Link from "next/link";

import { requireRole } from "@/lib/auth";

import SincronizarUI from "./SincronizarUI";

export const metadata = { title: "Sincronizar Nayax · Innovaypunto" };

export default async function SincronizarNayaxPage() {
  await requireRole("admin", "direccion");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/nayax"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Nayax
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Sincronizar con Nayax (Lynx)
        </h1>
        <p className="text-sm text-zinc-600">
          Trae las máquinas y productos configurados en Nayax, sugiere matches
          con tus máquinas locales y permite aplicar el mapeo en bloque.
        </p>
      </div>

      <SincronizarUI />
    </div>
  );
}
