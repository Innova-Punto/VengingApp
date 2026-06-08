"use client";

import { useState, useTransition } from "react";

import { editarPesajeItem } from "./actions";

type Item = {
  id: string;
  tolva_numero: number;
  gramos_teoricos: number;
  gramos_medidos: number;
  diferencia_gramos: number | null;
  diferencia_porcentaje: number | null;
  valor_diferencia: number | null;
};

export function EditarPesajeForm({ items }: { items: Item[] }) {
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <ItemRow key={it.id} item={it} />
      ))}
    </div>
  );
}

function ItemRow({ item }: { item: Item }) {
  const [gramos, setGramos] = useState<string>(String(item.gramos_medidos));
  const [motivo, setMotivo] = useState<string>("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const cambiado = Number(gramos) !== item.gramos_medidos;
  const diff = item.diferencia_gramos ?? 0;
  const diffCls =
    diff === 0 ? "text-zinc-700" : diff < 0 ? "text-red-700" : "text-green-700";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData();
    fd.set("item_id", item.id);
    fd.set("gramos_medidos", gramos);
    fd.set("motivo", motivo);
    startTransition(async () => {
      const r = await editarPesajeItem(fd);
      if (r?.error) setMsg({ kind: "err", text: r.error });
      else {
        setMsg({ kind: "ok", text: "Guardado." });
        setMotivo("");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-sm font-semibold">
          Tolva #{item.tolva_numero}
        </div>
        <div className="text-xs text-zinc-500">
          Teórico:{" "}
          <span className="font-semibold tabular-nums text-zinc-700">
            {item.gramos_teoricos}g
          </span>
          {" · "}Δ actual:{" "}
          <span className={`font-semibold tabular-nums ${diffCls}`}>
            {diff > 0 ? "+" : ""}
            {diff}g
            {item.diferencia_porcentaje != null
              ? ` (${item.diferencia_porcentaje}%)`
              : ""}
          </span>
          {item.valor_diferencia != null && (
            <>
              {" · "}Valor:{" "}
              <span className={`font-semibold tabular-nums ${diffCls}`}>
                $
                {Number(item.valor_diferencia).toLocaleString("es-MX", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="text-sm">
          <span className="text-xs text-zinc-600">Gramos medidos</span>
          <input
            type="number"
            min={0}
            step={1}
            value={gramos}
            onChange={(e) => setGramos(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm tabular-nums focus:border-zinc-500 focus:outline-none"
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-xs text-zinc-600">
            Motivo del ajuste{" "}
            <span className="text-zinc-400">(opcional, queda en kardex)</span>
          </span>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ej. Error de tipeo del operador"
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
          disabled={!cambiado || pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
