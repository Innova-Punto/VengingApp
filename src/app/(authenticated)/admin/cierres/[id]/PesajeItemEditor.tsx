"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState, useTransition } from "react";

import { corregirPesajeItem } from "../actions";

export default function PesajeItemEditor({
  itemId,
  cierreId,
  gramosMedidos,
  editable,
}: {
  itemId: string;
  cierreId: string;
  gramosMedidos: number;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(gramosMedidos));
  const [estado, setEstado] = useState<"idle" | "guardando" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!editable) {
    return <span className="tabular-nums">{gramosMedidos}g</span>;
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        {gramosMedidos}g
        <button
          type="button"
          onClick={() => {
            setValue(String(gramosMedidos));
            setEditing(true);
            setError(null);
          }}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          title="Corregir gramos medidos"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }

  function guardar() {
    setError(null);
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
      setError("Debe ser entero ≥ 0.");
      return;
    }
    if (n === gramosMedidos) {
      setEditing(false);
      return;
    }
    setEstado("guardando");
    startTransition(async () => {
      const r = await corregirPesajeItem({
        itemId,
        cierreId,
        gramosMedidos: n,
      });
      if (!r.ok) {
        setError(r.message);
        setEstado("error");
      } else {
        setEditing(false);
        setEstado("idle");
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-1">
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-20 rounded-md border border-zinc-300 px-1.5 py-0.5 text-right text-xs shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
        <span className="text-[10px] text-zinc-500">g</span>
        <button
          type="button"
          onClick={guardar}
          disabled={estado === "guardando"}
          className="rounded bg-green-600 p-0.5 text-white hover:bg-green-700 disabled:opacity-60"
          title="Guardar"
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="rounded bg-zinc-200 p-0.5 text-zinc-700 hover:bg-zinc-300"
          title="Cancelar"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {error && <p className="text-[10px] text-red-700">{error}</p>}
    </div>
  );
}
