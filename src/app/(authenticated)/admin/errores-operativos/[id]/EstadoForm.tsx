"use client";

import { useState, useTransition } from "react";

import { ESTADOS, type EstadoValue } from "@/lib/errores-operativos";

import { cambiarEstadoErrorOperativo } from "../actions";

export function EstadoForm({
  id,
  estadoActual,
}: {
  id: string;
  estadoActual: EstadoValue;
}) {
  const [estado, setEstado] = useState<EstadoValue>(estadoActual);
  const [nota, setNota] = useState<string>("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("estado", estado);
    fd.set("nota_resolucion", nota);
    startTransition(async () => {
      const r = await cambiarEstadoErrorOperativo(fd);
      if (r?.error) setMsg({ kind: "err", text: r.error });
      else {
        setMsg({ kind: "ok", text: "Guardado." });
        setNota("");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-4"
    >
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Cambiar estado
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="text-sm">
          <span className="text-xs text-zinc-600">Estado</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoValue)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
          >
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-xs text-zinc-600">
            Nota de resolución{" "}
            <span className="text-zinc-400">(opcional)</span>
          </span>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Acción tomada, justificación…"
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs">
          {msg && (
            <span
              className={
                msg.kind === "ok" ? "text-green-700" : "text-red-700"
              }
            >
              {msg.text}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={pending || estado === estadoActual}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
