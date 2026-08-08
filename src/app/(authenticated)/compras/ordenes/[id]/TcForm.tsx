"use client";

import { useFormState, useFormStatus } from "react-dom";

import { confirmarTcOc, type OcResult } from "../actions";

const initial: OcResult | null = null;

function SubmitButton({ confirmado }: { confirmado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Guardando…"
        : confirmado
          ? "Actualizar TC"
          : "Confirmar TC real"}
    </button>
  );
}

/**
 * Captura/edición del tipo de cambio de una OC en divisa. Al confirmar,
 * recalcula el costo MXN de todos los items. Se congela con la primera
 * recepción (la acción lo valida).
 */
export default function TcForm({
  ocId,
  moneda,
  tipoCambio,
  confirmado,
}: {
  ocId: string;
  moneda: string;
  tipoCambio: number | null;
  confirmado: boolean;
}) {
  const [state, action] = useFormState(confirmarTcOc, initial);

  return (
    <div
      className={`rounded-lg border p-4 ${
        confirmado
          ? "border-green-200 bg-green-50"
          : "border-amber-300 bg-amber-50"
      }`}
    >
      <h3
        className={`text-sm font-semibold ${
          confirmado ? "text-green-900" : "text-amber-900"
        }`}
      >
        {confirmado
          ? `✓ Tipo de cambio confirmado (${moneda})`
          : `⚠ Tipo de cambio provisional (${moneda})`}
      </h3>
      <p
        className={`mt-1 text-xs ${
          confirmado ? "text-green-800" : "text-amber-800"
        }`}
      >
        {confirmado
          ? "Los costos MXN de los items ya reflejan el TC real pagado. Puedes ajustarlo mientras no haya recepciones."
          : "Esta OC no se puede recibir hasta confirmar el TC real ponderado de los depósitos (anticipo y liquidación). Al confirmar, los costos MXN se recalculan automáticamente."}
      </p>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={ocId} />
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-600">
            TC final (MXN por {moneda})
          </label>
          <input
            name="tipo_cambio"
            type="number"
            min={0}
            step="0.0001"
            required
            defaultValue={tipoCambio ?? ""}
            placeholder="ej. 18.7532"
            className="mt-1 block w-44 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <SubmitButton confirmado={confirmado} />
      </form>
      {state && (
        <p
          className={`mt-2 text-sm ${state.ok ? "text-green-700" : "text-red-700"}`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
