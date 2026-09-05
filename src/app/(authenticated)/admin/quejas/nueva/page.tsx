import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import QuejaForm, { type MaquinaOpcion } from "./QuejaForm";

export const metadata = { title: "Registrar queja · Innovaypunto" };

export default async function NuevaQuejaPage() {
  await requireRole("admin", "direccion", "planeador");
  const supabase = createClient();

  const { data: maquinas } = await supabase
    .from("maquinas")
    .select("id, serie, alias, ubicacion:ubicaciones(nombre)")
    .eq("activo", true)
    .neq("estado", "baja")
    .order("serie");

  const opciones: MaquinaOpcion[] = (maquinas ?? []).map((m) => {
    const u = Array.isArray(m.ubicacion) ? m.ubicacion[0] : m.ubicacion;
    return {
      id: m.id,
      serie: m.serie,
      alias: m.alias,
      ubicacion: u?.nombre ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/quejas"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Quejas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Registrar queja
        </h1>
        <p className="text-sm text-zinc-600">
          El operador que atiende la máquina se asigna solo; no hay que
          capturarlo.
        </p>
      </div>

      <div className="max-w-xl rounded-lg border border-zinc-200 bg-white p-6">
        <QuejaForm maquinas={opciones} />
      </div>
    </div>
  );
}
