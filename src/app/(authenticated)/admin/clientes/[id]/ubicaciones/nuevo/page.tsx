import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import UbicacionForm from "../../../UbicacionForm";

export const metadata = { title: "Nueva ubicación · MuscleUp" };

export default async function NuevaUbicacionPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion");

  const supabase = createClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre")
    .eq("id", params.id)
    .maybeSingle();

  if (!cliente) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/clientes/${params.id}`}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← {cliente.nombre}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nueva ubicación
        </h1>
      </div>

      <div className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6">
        <UbicacionForm mode="crear" clienteId={params.id} />
      </div>
    </div>
  );
}
