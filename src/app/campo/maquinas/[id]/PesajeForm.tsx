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

type VasoInfo = {
  producto_nombre: string;
  producto_sku: string;
  inventario_actual: number;
};

export default function PesajeForm({
  checkInId,
  asignacionId,
  maquinaId,
  tolvas,
  vaso,
  cierrePeriodo,
}: {
  checkInId: string;
  asignacionId: string;
  maquinaId: string;
  tolvas: TolvaPesaje[];
  /** Info del vaso configurado en la máquina. null si la máquina no vende vasos. */
  vaso: VasoInfo | null;
  cierrePeriodo?: { mes: number; anio: number } | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [lineas, setLineas] = useState<Record<string, Linea>>(() => {
    const init: Record<string, Linea> = {};
    for (const t of tolvas) {
      init[t.id] = { tolva_id: t.id, gramos_medidos: "" };
    }
    return init;
  });
  const [vasosInput, setVasosInput] = useState("");
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

    // Todas las tolvas son obligatorias para garantizar un snapshot completo
    // del inventario (pesaje inicial y cierre mensual).
    const tolvasFaltantes = tolvas.filter((t) => {
      const v = lineas[t.id]?.gramos_medidos ?? "";
      return v === "" || isNaN(Number(v));
    });
    if (tolvasFaltantes.length > 0) {
      setError(
        `Captura el peso de TODAS las tolvas. Faltan: ${tolvasFaltantes
          .map((t) => `#${t.numero}`)
          .join(", ")}.`,
      );
      setEstado("error");
      return;
    }

    const payload = tolvas.map((t) => ({
      tolva_id: t.id,
      gramos_medidos: Math.max(0, Math.trunc(Number(lineas[t.id].gramos_medidos))),
    }));

    // Vasos obligatorios cuando la máquina tiene vaso configurado.
    let vasosMedidos: number | null = null;
    if (vaso) {
      if (vasosInput === "" || isNaN(Number(vasosInput))) {
        setError("Captura el conteo de vasos.");
        setEstado("error");
        return;
      }
      vasosMedidos = Math.max(0, Math.trunc(Number(vasosInput)));
    }

    setEstado("enviando");
    startTransition(async () => {
      const r = await registrarPesaje({
        checkInId,
        asignacionId,
        maquinaId,
        items: payload,
        notas: notas || null,
        vasosMedidos,
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
        Captura el peso de <strong>todas</strong> las tolvas
        {vaso && " y el conteo de vasos"}. El sistema calcula la diferencia
        con el inventario teórico y ajusta el saldo.
      </p>
      {cierrePeriodo && (
        <p className="rounded-md border border-blue-200 bg-white/60 px-2 py-1 text-[11px] font-medium text-blue-900">
          Este pesaje cuenta para el cierre {String(cierrePeriodo.mes).padStart(2, "0")}/
          {cierrePeriodo.anio}.
        </p>
      )}

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

      {vaso && (
        <div className="rounded-md border border-blue-200 bg-white p-3">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-semibold text-blue-900">Vasos</div>
            <div className="text-xs text-zinc-500">
              Teórico: {vaso.inventario_actual}
            </div>
          </div>
          <div className="text-xs text-zinc-600">
            {vaso.producto_nombre}{" "}
            <span className="font-mono text-[10px] text-zinc-400">
              {vaso.producto_sku}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="cantidad"
              value={vasosInput}
              onChange={(e) => setVasosInput(e.target.value)}
              className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
            />
            <span className="text-sm text-zinc-500">vasos contados</span>
          </div>
        </div>
      )}

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
