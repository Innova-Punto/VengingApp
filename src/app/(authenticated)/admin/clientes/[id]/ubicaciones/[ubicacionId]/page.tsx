import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import UbicacionForm from "../../../UbicacionForm";

export const metadata = { title: "Editar ubicación · MuscleUp" };

export default async function EditarUbicacionPage({
  params,
}: {
  params: { id: string; ubicacionId: string };
}) {
  await requireRole("admin", "direccion");

  const supabase = createClient();

  const [{ data: cliente }, { data: ubicacion, error }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("ubicaciones")
      .select("*")
      .eq("id", params.ubicacionId)
      .eq("cliente_id", params.id)
      .maybeSingle(),
  ]);

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!cliente || !ubicacion) notFound();

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
          {ubicacion.nombre}
        </h1>
      </div>

      <div className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6">
        <UbicacionForm
          mode="editar"
          clienteId={params.id}
          ubicacion={ubicacion}
        />
      </div>
    </div>
  );
}
