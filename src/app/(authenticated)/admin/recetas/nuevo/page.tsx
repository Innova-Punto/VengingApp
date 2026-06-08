import Link from "next/link";

import { requireRole } from "@/lib/auth";

import RecetaForm from "../RecetaForm";

export const metadata = { title: "Nueva receta · MuscleUp" };

export default async function NuevaRecetaPage() {
  await requireRole("admin", "direccion");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/admin/recetas" className="hover:underline">
          Recetas
        </Link>
        <span>/</span>
        <span className="text-zinc-700">Nueva</span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Nueva receta</h1>
      <RecetaForm />
    </div>
  );
}
