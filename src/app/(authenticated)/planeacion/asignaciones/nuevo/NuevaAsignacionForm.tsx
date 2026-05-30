"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState } from "react";

import { crearAsignacion, type AsigResult } from "../actions";

type Ruta = {
  id: string;
  nombre: string;
  operador_titular_id: string | null;
  maquinas_count: number;
};
type Operador = { id: string; full_name: string };

const initial: AsigResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creando..." : "Crear asignación"}
    </button>
  );
}

export default function NuevaAsignacionForm({
  defaultFecha,
  rutas,
  operadores,
}: {
  defaultFecha: string;
  rutas: Ruta[];
  operadores: Operador[];
}) {
  const [state, action] = useFormState(crearAsignacion, initial);
  const [rutaId, setRutaId] = useState("");
  const ruta = useMemo(
    () => rutas.find((r) => r.id === rutaId),
    [rutaId, rutas],
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">
            Fecha <span className="text-red-600">*</span>
          </label>
          <input
            name="fecha"
            type="date"
            required
            defaultValue={defaultFecha}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">
            Ruta <span className="text-red-600">*</span>
          </label>
          <select
            name="ruta_id"
            required
            value={rutaId}
            onChange={(e) => setRutaId(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">— Selecciona —</option>
            {rutas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre} ({r.maquinas_count} máquinas)
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">
            Operador <span className="text-red-600">*</span>
          </label>
          <select
            name="operador_id"
            required
            key={ruta?.operador_titular_id ?? "no-ruta"}
            defaultValue={ruta?.operador_titular_id ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">— Selecciona —</option>
            {operadores.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
              </option>
            ))}
          </select>
          {ruta?.operador_titular_id && (
            <p className="text-xs text-zinc-500">
              Pre-seleccionado el operador titular de la ruta. Puedes
              cambiarlo si está ausente.
            </p>
          )}
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">Notas</label>
          <textarea
            name="notas"
            rows={2}
            placeholder="Ej. operador titular de vacaciones, cubre Pedro"
            className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>

      {state && !state.ok && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
