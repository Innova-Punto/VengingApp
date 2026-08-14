import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import PropuestaDinamica, { type MaquinaScore } from "./PropuestaDinamica";

export const metadata = { title: "Asignación dinámica · Innovaypunto" };
export const dynamic = "force-dynamic";

/** Máquinas por operador por día (carga fija acordada con dirección). */
const CAP_DEFAULT = 11;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AsignacionDinamicaPage({
  searchParams,
}: {
  searchParams: { fecha?: string; cap?: string };
}) {
  await requireRole("admin", "direccion", "planeador");

  const fecha = (searchParams.fecha ?? todayISO()).slice(0, 10);
  const capRaw = Number(searchParams.cap);
  const cap =
    Number.isInteger(capRaw) && capRaw >= 1 && capRaw <= 30
      ? capRaw
      : CAP_DEFAULT;

  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "sugerencia_ruteo_diaria",
  );

  // Asignaciones ya existentes para la fecha (para avisar choques de ruta)
  const { data: existentes } = await supabase
    .from("asignaciones_diarias")
    .select("ruta_id, estado, ruta:rutas(nombre)")
    .eq("fecha", fecha)
    .neq("estado", "cancelada");

  const rutasOcupadas = new Map<string, string>();
  for (const a of existentes ?? []) {
    const ruta = Array.isArray(a.ruta) ? a.ruta[0] : a.ruta;
    if (a.ruta_id) rutasOcupadas.set(a.ruta_id, ruta?.nombre ?? "");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/planeacion/asignaciones?fecha=${fecha}`}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Asignaciones
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          ⚡ Asignación dinámica
        </h1>
        <p className="text-sm text-zinc-600">
          El sistema propone las {cap} máquinas más prioritarias de la zona de
          cada operador (revisión &gt; crítica &gt; alta &gt; visita vencida
          &gt; media &gt; baja &gt; relleno). Tú editas y confirmas — el modo
          estático sigue disponible en «Nueva asignación».
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Fecha
          </label>
          <input
            type="date"
            name="fecha"
            defaultValue={fecha}
            className="mt-1 w-44 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Máquinas por operador
          </label>
          <input
            type="number"
            name="cap"
            min={1}
            max={30}
            defaultValue={cap}
            className="mt-1 w-32 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Recalcular propuesta
        </button>
      </form>

      {error ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          No se pudo calcular la propuesta: {error.message}
          <div className="mt-1 text-xs">
            Si el error es que la función no existe, falta aplicar la migración
            <code className="mx-1">20260814120000_ruteo_dinamico.sql</code>
            (npm run db:push).
          </div>
        </div>
      ) : (
        <PropuestaDinamica
          fecha={fecha}
          cap={cap}
          maquinas={(data ?? []) as MaquinaScore[]}
          rutasOcupadas={Object.fromEntries(rutasOcupadas)}
        />
      )}
    </div>
  );
}
