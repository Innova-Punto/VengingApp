"use client";

import { useState, useTransition } from "react";

import { cerrarJornadaIncompleta } from "./actions";

const MOTIVOS = [
  "Salida tarde",
  "Problema con vehículo",
  "Sucursal cerrada",
] as const;

/**
 * Botón discreto para que el operador cierre la ruta antes de tiempo si
 * algo le impidió terminar todas las máquinas. Pide motivo (lista
 * predefinida + "otro" como texto libre) y deja la asignación en estado
 * `completada_incompleta` (terminal, no cuenta como completada).
 */
export default function CerrarIncompletaButton({
  asignacionId,
}: {
  asignacionId: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<string>("");
  const [otroTexto, setOtroTexto] = useState<string>("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const motivoFinal = motivo === "Otro" ? otroTexto.trim() : motivo;
  const valido = motivoFinal.length >= 3;

  function enviar() {
    setError(null);
    if (!valido) {
      setError("Selecciona un motivo.");
      return;
    }
    setEstado("enviando");
    startTransition(async () => {
      const r = await cerrarJornadaIncompleta({
        asignacionId,
        motivo: motivoFinal,
      });
      if (!r.ok) {
        setError(r.message);
        setEstado("error");
      } else {
        setAbierto(false);
        setEstado("idle");
      }
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline"
      >
        Cerrar ruta incompleta
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
      <div className="text-xs font-semibold text-amber-900">
        Cerrar ruta incompleta
      </div>
      <p className="text-[11px] text-amber-800">
        La ruta quedará marcada como terminada sin completar. Indica el motivo:
      </p>

      <div className="space-y-1">
        {MOTIVOS.map((m) => (
          <label
            key={m}
            className="flex items-center gap-2 text-sm text-zinc-800"
          >
            <input
              type="radio"
              name="motivo"
              value={m}
              checked={motivo === m}
              onChange={() => setMotivo(m)}
              className="h-4 w-4"
            />
            {m}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input
            type="radio"
            name="motivo"
            value="Otro"
            checked={motivo === "Otro"}
            onChange={() => setMotivo("Otro")}
            className="h-4 w-4"
          />
          Otro
        </label>
        {motivo === "Otro" && (
          <input
            type="text"
            placeholder="Describe el motivo"
            value={otroTexto}
            onChange={(e) => setOtroTexto(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          />
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          disabled={estado === "enviando"}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 active:bg-zinc-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={enviar}
          disabled={!valido || estado === "enviando"}
          className="flex-1 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white active:bg-amber-800 disabled:opacity-60"
        >
          {estado === "enviando" ? "Cerrando…" : "Confirmar cierre"}
        </button>
      </div>

      {error && <p className="text-[11px] text-red-700">{error}</p>}
    </div>
  );
}
