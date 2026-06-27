"use client";

import { useFormState, useFormStatus } from "react-dom";

import { crearEmergencia, type EmgResult } from "./actions";

type Operador = { id: string; full_name: string | null };

const initial: EmgResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creando…" : "Crear emergencia"}
    </button>
  );
}

export default function CrearEmergenciaForm({
  operadores,
  fecha,
}: {
  operadores: Operador[];
  fecha: string;
}) {
  const [state, action] = useFormState(crearEmergencia, initial);

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Operador *
        </label>
        <select
          name="operador_id"
          required
          className="mt-1 w-56 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="">— Selecciona —</option>
          {operadores.map((o) => (
            <option key={o.id} value={o.id}>
              {o.full_name ?? "(sin nombre)"}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Fecha *
        </label>
        <input
          type="date"
          name="fecha"
          defaultValue={fecha}
          required
          className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>
      <div className="flex-1 min-w-[180px]">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notas (opcional)
        </label>
        <input
          type="text"
          name="notas"
          placeholder="ej. Falla reportada por Nayax"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>
      <SubmitButton />
      {state && (
        <p
          className={`w-full text-sm ${state.ok ? "text-green-700" : "text-red-700"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
