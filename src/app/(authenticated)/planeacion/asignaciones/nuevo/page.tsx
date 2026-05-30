import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import NuevaAsignacionForm from "./NuevaAsignacionForm";

export const metadata = { title: "Nueva asignación · MuscleUp" };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function NuevaAsignacionPage({
  searchParams,
}: {
  searchParams: { fecha?: string };
}) {
  await requireRole("admin", "direccion", "planeador");

  const fecha = (searchParams.fecha ?? todayISO()).slice(0, 10);

  const supabase = createClient();

  const [
    { data: rutasRaw },
    { data: rolesRows },
  ] = await Promise.all([
    supabase
      .from("rutas")
      .select(
        `id, nombre, operador_titular_id,
         maquinas:ruta_maquinas(id)`,
      )
      .eq("activa", true)
      .order("nombre"),
    supabase
      .from("user_roles")
      .select("user_id, profile:profiles(id, full_name, activo)")
      .eq("role", "operador"),
  ]);

  const operadores = (rolesRows ?? [])
    .map((r) => {
      const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      return p && p.activo ? { id: p.id, full_name: p.full_name } : null;
    })
    .filter((p): p is { id: string; full_name: string } => p !== null);

  const rutas = (rutasRaw ?? []).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    operador_titular_id: r.operador_titular_id,
    maquinas_count: Array.isArray(r.maquinas) ? r.maquinas.length : 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/planeacion/asignaciones"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Asignaciones
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nueva asignación
        </h1>
        <p className="text-sm text-zinc-500">
          Al crearla se copian las máquinas base de la ruta. Después puedes
          agregar o quitar máquinas por excepción.
        </p>
      </div>

      {rutas.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No hay rutas activas. Crea una primero en{" "}
          <Link href="/admin/rutas" className="underline">
            Rutas
          </Link>
          .
        </div>
      ) : operadores.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No hay usuarios con rol &laquo;operador&raquo; activos. Asigna el rol
          en{" "}
          <Link href="/admin/usuarios" className="underline">
            Usuarios
          </Link>
          .
        </div>
      ) : (
        <div className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-6">
          <NuevaAsignacionForm
            defaultFecha={fecha}
            rutas={rutas}
            operadores={operadores}
          />
        </div>
      )}
    </div>
  );
}
