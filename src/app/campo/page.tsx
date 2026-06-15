import {
  CalendarDays,
  ChevronRight,
  MapPin,
  Truck,
} from "lucide-react";
import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
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
      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand/10 text-brand">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold tracking-tight text-zinc-900">
            Hoy
          </div>
          <p className="text-xs text-zinc-600 capitalize">
            {fmtCDMX(new Date(), {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-brand">
            {asigArray.length}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">
            asignacion{asigArray.length === 1 ? "" : "es"}
          </div>
        </div>
      </div>

      {asigArray.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
          <Truck className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
          <p className="text-sm text-zinc-500">No tienes asignaciones para hoy.</p>
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
              className="block overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition active:scale-[0.99] active:bg-zinc-50"
            >
              <div className="flex items-stretch gap-3">
                <div
                  className="w-1.5 shrink-0"
                  style={{ backgroundColor: ruta?.color_hex ?? "#a1a1aa" }}
                />
                <div className="flex flex-1 items-center gap-3 py-3 pr-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium text-zinc-900">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span className="truncate">
                        {ruta?.nombre ?? "Ruta sin nombre"}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                      <MapPin className="h-3 w-3" />
                      {numMaquinas} máquina{numMaquinas === 1 ? "" : "s"}
                    </div>
                  </div>
                  <EstadoBadge estado={a.estado} jornadaIniciada={!!jornada} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                </div>
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
