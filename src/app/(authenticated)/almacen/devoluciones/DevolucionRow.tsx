"use client";

import { useFormState, useFormStatus } from "react-dom";

import { recibirDevolucion, type ActionResult } from "./actions";

type Props = {
  id: string;
  cantidadCalculada: number;
  productoSku: string;
  productoNombre: string;
};

const initial: ActionResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
    >
      {pending ? "..." : "Recibir"}
    </button>
  );
}

export default function DevolucionRow({
  id,
  cantidadCalculada,
  productoSku,
  productoNombre,
}: Props) {
  const [state, action] = useFormState(recibirDevolucion, initial);

  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <div className="font-medium text-zinc-900">{productoNombre}</div>
        <div className="font-mono text-xs text-zinc-500">{productoSku}</div>
        {state && !state.ok && (
          <p className="mt-1 text-xs text-red-700">{state.message}</p>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{cantidadCalculada}</td>
      <td className="px-3 py-2" colSpan={2}>
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={id} />
          <div className="w-20">
            <label className="text-[10px] uppercase tracking-wide text-zinc-500">
              Recibido
            </label>
            <input
              name="cantidad_recibida"
              type="number"
              min={0}
              step={1}
              defaultValue={cantidadCalculada}
              required
              className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="text-[10px] uppercase tracking-wide text-zinc-500">
              Notas
            </label>
            <input
              name="notas"
              type="text"
              placeholder="opcional"
              className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <SubmitButton />
        </form>
      </td>
    </tr>
  );
}
