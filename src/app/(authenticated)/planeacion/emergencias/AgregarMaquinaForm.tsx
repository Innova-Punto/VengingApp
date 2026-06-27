"use client";

import { useFormState, useFormStatus } from "react-dom";

import { agregarMaquinaEmergencia, type EmgResult } from "./actions";

type Maquina = { id: string; serie: string; alias: string | null };

const initial: EmgResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Agregando…" : "Agregar"}
    </button>
  );
}

export default function AgregarMaquinaForm({
  asignacionId,
  maquinas,
}: {
  asignacionId: string;
  maquinas: Maquina[];
}) {
  const [state, action] = useFormState(agregarMaquinaEmergencia, initial);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="asignacion_id" value={asignacionId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Máquina
          </label>
          <select
            name="maquina_id"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">— Selecciona máquina —</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.serie}
                {m.alias ? ` · ${m.alias}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Modo
          </label>
          <div className="mt-1 flex items-center gap-3 rounded-md border border-zinc-300 px-3 py-1.5">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="modo"
                value="surtir"
                defaultChecked
                className="h-3.5 w-3.5"
              />
              Surtir
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="modo"
                value="visita"
                className="h-3.5 w-3.5"
              />
              Solo visita
            </label>
          </div>
        </div>
        <SubmitButton />
      </div>
      <p className="text-[11px] text-zinc-500">
        <strong>Surtir</strong>: genera el sugerido y descuenta cartuchos/vasos
        por PEPS. <strong>Solo visita</strong>: la deja para diagnóstico, sin
        llevar nada.
      </p>
      {state && (
        <p
          className={`text-sm ${state.ok ? "text-green-700" : "text-red-700"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
