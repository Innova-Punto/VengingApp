"use client";

import { useFormState, useFormStatus } from "react-dom";

import { actualizarIncidencia, type ActionResult } from "../actions";

const initial: ActionResult | null = null;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
    >
      {pending ? "..." : label}
    </button>
  );
}

export default function IncidenciaFormDetalle({
  id,
  estadoActual,
  requiereMerma,
  yaAutorizada,
  notasIniciales,
}: {
  id: string;
  estadoActual: string;
  requiereMerma: boolean;
  yaAutorizada: boolean;
  notasIniciales: string;
}) {
  const [state, action] = useFormState(actualizarIncidencia, initial);
  const cerrada = estadoActual === "resuelta" || estadoActual === "descartada";

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={id} />

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Cambiar estado
          </label>
          <select
            name="estado"
            defaultValue={estadoActual}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="abierta">Abierta</option>
            <option value="en_revision">En revisión</option>
            <option value="resuelta">Resuelta</option>
            <option value="descartada">Descartada</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Notas de resolución
          </label>
          <textarea
            name="notas_resolucion"
            defaultValue={notasIniciales}
            rows={3}
            placeholder="Qué se hizo o por qué se descarta"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        {requiereMerma && !yaAutorizada && (
          <label className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="autorizar_merma"
              value="1"
              className="h-4 w-4"
            />
            <span className="text-amber-900">
              Autorizar la merma de los cartuchos afectados.
            </span>
          </label>
        )}

        <Submit label="Guardar" />

        {state && !state.ok && (
          <p className="text-sm text-red-700">{state.message}</p>
        )}
        {state?.ok && (
          <p className="text-sm text-green-700">{state.message}</p>
        )}
      </form>

      {cerrada && (
        <p className="text-xs text-zinc-500">
          Esta incidencia está cerrada. Puedes reabrirla cambiando el estado.
        </p>
      )}
    </div>
  );
}
