"use client";

import { useState, useTransition } from "react";

import { registrarPesaje } from "./actions";

type TolvaPesaje = {
  id: string;
  numero: number;
  inventario_actual_g: number;
  producto_nombre: string;
  producto_sku: string;
};

type Linea = {
  tolva_id: string;
  gramos_medidos: string;
};

export default function PesajeForm({
  checkInId,
  asignacionId,
  maquinaId,
  tolvas,
}: {
  checkInId: string;
  asignacionId: string;
  maquinaId: string;
  tolvas: TolvaPesaje[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [lineas, setLineas] = useState<Record<string, Linea>>(() => {
    const init: Record<string, Linea> = {};
    for (const t of tolvas) {
      init[t.id] = { tolva_id: t.id, gramos_medidos: "" };
    }
    return init;
  });
  const [notas, setNotas] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "error" | "ok">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-900 active:bg-blue-100"
      >
        Pesar tolvas
      </button>
    );
  }

  function setLinea(tolvaId: string, gramos: string) {
    setLineas((prev) => ({
      ...prev,
      [tolvaId]: { ...prev[tolvaId], gramos_medidos: gramos },
    }));
  }

  function enviar() {
    setError(null);

    const payload = Object.values(lineas)
      .filter((l) => l.gramos_medidos !== "" && !isNaN(Number(l.gramos_medidos)))
      .map((l) => ({
        tolva_id: l.tolva_id,
        gramos_medidos: Number(l.gramos_medidos),
      }));

    if (payload.length === 0) {
      setError("Captura el peso de al menos una tolva.");
      return;
    }

    setEstado("enviando");
    startTransition(async () => {
      const r = await registrarPesaje({
        checkInId,
        asignacionId,
        maquinaId,
        items: payload,
        notas: notas || null,
      });
      if (!r.ok) {
        setError(r.message);
        setEstado("error");
      } else {
        setEstado("ok");
        setAbierto(false);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-blue-300 bg-blue-50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blue-900">Pesar tolvas</h3>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs text-blue-800 underline"
        >
          Cancelar
        </button>
      </div>

      <p className="text-xs text-blue-900">
        Captura el peso real de cada tolva. El sistema calcula la diferencia
        con el inventario teórico y ajusta el saldo.
      </p>

      <div className="space-y-2">
        {tolvas.map((t) => (
          <div
            key={t.id}
            className="rounded-md border border-blue-200 bg-white p-3"
          >
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-sm font-medium">#{t.numero}</div>
              <div className="text-xs text-zinc-500">
                Teórico: {t.inventario_actual_g}g
              </div>
            </div>
            <div className="text-xs text-zinc-600">
              {t.producto_nombre}{" "}
              <span className="font-mono text-[10px] text-zinc-400">
                {t.producto_sku}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="gramos"
                value={lineas[t.id]?.gramos_medidos ?? ""}
                onChange={(e) => setLinea(t.id, e.target.value)}
                className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
              />
              <span className="text-sm text-zinc-500">g medidos</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-blue-900">
          Notas (opcional)
        </label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-blue-200 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-900 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={enviar}
        disabled={estado === "enviando"}
        className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm active:bg-blue-800 disabled:opacity-60"
      >
        {estado === "enviando" ? "Registrando..." : "Registrar pesaje"}
      </button>

      {error && <p className="text-xs text-red-700">{error}</p>}
      {estado === "ok" && (
        <p className="text-xs text-green-700">Pesaje registrado.</p>
      )}
    </div>
  );
}
