"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  agregarMaquinaExcepcion,
  type AsigMaqResult,
} from "../actions";

type Maquina = {
  id: string;
  serie: string;
  alias: string | null;
  cliente_nombre: string;
  ubicacion_nombre: string;
};

const initial: AsigMaqResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Agregando..." : "Agregar"}
    </button>
  );
}

export default function AgregarMaquinaExcepcionForm({
  asignacionId,
  maquinas,
}: {
  asignacionId: string;
  maquinas: Maquina[];
}) {
  const [state, action] = useFormState(agregarMaquinaExcepcion, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="asignacion_id" value={asignacionId} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Máquina *
          </label>
          <select
            name="maquina_id"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">— Selecciona —</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.serie}
                {m.alias ? ` · ${m.alias}` : ""} ({m.cliente_nombre} ·{" "}
                {m.ubicacion_nombre})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Motivo *
          </label>
          <select
            name="motivo_excepcion"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="ausencia_operador">Ausencia operador</option>
            <option value="emergencia">Emergencia</option>
            <option value="mantenimiento">Mantenimiento</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Orden
          </label>
          <input
            name="orden"
            type="number"
            min={0}
            step={1}
            defaultValue={99}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div className="md:col-span-3">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Notas
          </label>
          <input
            name="notas"
            placeholder="opcional"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div className="flex items-end">
          <SubmitButton />
        </div>
      </div>

      {state && !state.ok && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}
      {state && state.ok && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
