import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import MaquinaForm from "../MaquinaForm";

export const metadata = { title: "Nueva máquina · MuscleUp" };

export default async function NuevaMaquinaPage() {
  await requireRole("admin", "direccion");

  const supabase = createClient();
  const { data: ubicacionesRaw } = await supabase
    .from("ubicaciones")
    .select("id, nombre, cliente:clientes(nombre)")
    .eq("activo", true)
    .order("nombre");

  const ubicaciones = (ubicacionesRaw ?? []).map((u) => {
    const cliente = Array.isArray(u.cliente) ? u.cliente[0] : u.cliente;
    return {
      id: u.id,
      nombre: u.nombre,
      cliente_nombre: cliente?.nombre ?? "(sin cliente)",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/maquinas"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Máquinas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nueva máquina
        </h1>
        <p className="text-sm text-zinc-500">
          Al crearla se generan automáticamente las tolvas vacías. El
          planograma se configura desde el detalle de la máquina.
        </p>
      </div>

      {ubicaciones.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No hay ubicaciones activas. Crea una primero en{" "}
          <Link href="/admin/clientes" className="underline">
            Clientes
          </Link>{" "}
          para poder asignarla a esta máquina.
        </div>
      ) : (
        <div className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6">
          <MaquinaForm mode="crear" ubicaciones={ubicaciones} />
        </div>
      )}
    </div>
  );
}
