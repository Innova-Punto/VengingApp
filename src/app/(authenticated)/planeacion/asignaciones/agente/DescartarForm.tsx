"use client";

import { useState } from "react";

import { descartarPropuesta } from "./actions";

/**
 * Descartar exige escribir por qué. Es la única retroalimentación que vamos a
 * tener sobre el agente: sin ese texto, en tres meses nadie va a saber si sus
 * propuestas sirven o si Mariana lleva semanas rehaciéndolas a mano.
 */
export default function DescartarForm({ propuestaId }: { propuestaId: string }) {
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Descartar
      </button>
    );
  }

  return (
    <form action={descartarPropuesta} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="propuesta_id" value={propuestaId} />
      <input
        name="motivo"
        required
        autoFocus
        placeholder="¿Por qué no te sirvió?"
        className="w-72 rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-md border border-zinc-400 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Descartar
      </button>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="text-xs text-zinc-500 underline"
      >
        Cancelar
      </button>
    </form>
  );
}
