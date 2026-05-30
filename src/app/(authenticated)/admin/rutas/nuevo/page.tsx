import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import RutaForm from "../RutaForm";

export const metadata = { title: "Nueva ruta · MuscleUp" };

export default async function NuevaRutaPage() {
  await requireRole("admin", "direccion", "planeador");

  const supabase = createClient();

  // Solo profiles que tengan rol "operador"
  const { data: rolesRows } = await supabase
    .from("user_roles")
    .select("user_id, profile:profiles(id, full_name)")
    .eq("role", "operador");

  const operadores = (rolesRows ?? [])
    .map((r) => {
      const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      return p ? { id: p.id, full_name: p.full_name } : null;
    })
    .filter((p): p is { id: string; full_name: string } => p !== null);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/rutas"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Rutas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nueva ruta
        </h1>
      </div>

      <div className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-6">
        <RutaForm mode="crear" operadores={operadores} />
      </div>
    </div>
  );
}
