import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CampoHomePage() {
  const user = await requireRole("operador", "admin", "direccion");
  const supabase = createClient();

  const hoy = new Date().toISOString().slice(0, 10);

  // Asignaciones de hoy del operador
  const { data: asignaciones } = await supabase
    .from("asignaciones_diarias")
    .select(
      `id, fecha, estado,
       ruta:rutas(nombre, color_hex),
       jornada:jornadas(id),
       maquinas:asignacion_maquinas(id)`,
    )
    .eq("operador_id", user.id)
    .eq("fecha", hoy)
    .order("created_at");

  const asigArray = asignaciones ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hoy</h1>
        <p className="text-sm text-zinc-600">
          {new Date().toLocaleDateString("es-MX", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      {asigArray.length === 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
          No tienes asignaciones para hoy.
        </div>
      )}

      <div className="space-y-3">
        {asigArray.map((a) => {
          const ruta = Array.isArray(a.ruta) ? a.ruta[0] : a.ruta;
          const jornada = Array.isArray(a.jornada) ? a.jornada[0] : a.jornada;
          const numMaquinas = Array.isArray(a.maquinas) ? a.maquinas.length : 0;
          return (
            <Link
              key={a.id}
              href={`/campo/jornada/${a.id}`}
              className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm active:bg-zinc-50"
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 h-12 w-1.5 rounded-sm"
                  style={{ backgroundColor: ruta?.color_hex ?? "#a1a1aa" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-zinc-900">
                    {ruta?.nombre ?? "Ruta sin nombre"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {numMaquinas} máquina{numMaquinas === 1 ? "" : "s"}
                  </div>
                </div>
                <EstadoBadge estado={a.estado} jornadaIniciada={!!jornada} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function EstadoBadge({
  estado,
  jornadaIniciada,
}: {
  estado: string;
  jornadaIniciada: boolean;
}) {
  const map: Record<string, { label: string; cls: string }> = {
    planeada: { label: "Sin surtir", cls: "bg-zinc-100 text-zinc-600" },
    surtida: jornadaIniciada
      ? { label: "En curso", cls: "bg-amber-100 text-amber-700" }
      : { label: "Lista", cls: "bg-blue-100 text-blue-700" },
    en_jornada: { label: "En curso", cls: "bg-amber-100 text-amber-700" },
    completada: { label: "Completada", cls: "bg-green-100 text-green-700" },
    cancelada: { label: "Cancelada", cls: "bg-red-100 text-red-700" },
  };
  const v = map[estado] ?? { label: estado, cls: "bg-zinc-100" };
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${v.cls}`}
    >
      {v.label}
    </span>
  );
}
