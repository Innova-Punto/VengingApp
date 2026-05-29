import Link from "next/link";

import { requireRole } from "@/lib/auth";

import ClienteForm from "../ClienteForm";

export const metadata = { title: "Nuevo cliente · MuscleUp" };

export default async function NuevoClientePage() {
  await requireRole("admin", "direccion");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/clientes"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nuevo cliente
        </h1>
      </div>

      <div className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6">
        <ClienteForm mode="crear" />
      </div>
    </div>
  );
}
