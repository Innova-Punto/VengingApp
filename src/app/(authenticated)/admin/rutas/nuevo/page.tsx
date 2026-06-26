import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import RutaForm from "../RutaForm";

export const metadata = { title: "Nueva ruta · Innovaypunto" };

export default async function NuevaRutaPage() {
  await requireRole("admin", "direccion", "planeador");

  const supabase = createClient();

  // Solo profiles que tengan rol "operador" — dos queries separadas
  // porque el embedded select profile:profiles(...) no siempre se resuelve.
  const { data: rolesRows } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "operador");

  const operadorIds = (rolesRows ?? []).map((r) => r.user_id);

  const { data: profilesOperadores } =
    operadorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", operadorIds)
          .eq("activo", true)
          .order("full_name")
      : { data: [] };

  const operadores = (profilesOperadores ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
  }));

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
