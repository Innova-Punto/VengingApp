"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  agregarMaquinaARuta,
  type RutaMaquinaResult,
} from "./actions";

type Maquina = {
  id: string;
  serie: string;
  alias: string | null;
  cliente_nombre: string;
  ubicacion_nombre: string;
};

const initial: RutaMaquinaResult | null = null;

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

export default function AgregarMaquinaForm({
  rutaId,
  maquinas,
}: {
  rutaId: string;
  maquinas: Maquina[];
}) {
  const [state, action] = useFormState(agregarMaquinaARuta, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="ruta_id" value={rutaId} />

      <div className="min-w-[260px] flex-1">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Máquina sin ruta asignada *
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

      <div className="w-24">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Orden
        </label>
        <input
          name="orden"
          type="number"
          min={0}
          step={1}
          defaultValue={0}
          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>

      <SubmitButton />

      {state && !state.ok && (
        <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}
      {state && state.ok && (
        <p className="w-full rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
