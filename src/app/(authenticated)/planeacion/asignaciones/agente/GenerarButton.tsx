"use client";

import { useFormStatus } from "react-dom";

/**
 * El botón tiene que decir que está trabajando.
 *
 * Una corrida tarda entre diez segundos y medio minuto —el modelo razona sobre
 * 72 máquinas—, y sin señal la pantalla se ve idéntica antes y después de
 * picarle. Quien no sabe si apretó bien, aprieta otra vez: dos corridas, dos
 * cobros y dos propuestas del mismo día.
 */
export default function GenerarButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition ${
        pending
          ? "cursor-wait border-zinc-300 bg-zinc-100 text-zinc-500"
          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {pending && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"
        />
      )}
      {pending ? "Pensando la ruta…" : "Generar propuesta ahora"}
    </button>
  );
}
