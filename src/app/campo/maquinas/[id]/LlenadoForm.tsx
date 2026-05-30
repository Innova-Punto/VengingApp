"use client";

import { useState, useTransition } from "react";

import { registrarLlenado } from "./actions";

type TolvaCandidata = {
  id: string;
  numero: number;
  gramaje_servicio: number | null;
};

type Item = {
  id: string;
  producto_id: string;
  cartuchos_entregados: number;
  encartuchado_id: string | null;
  producto: { sku: string; nombre: string; tipo: string } | null;
  tolvas_candidatas: TolvaCandidata[];
};

type Linea = {
  surtido_item_id: string;
  tolva_id: string;
  cartuchos_cargados: number;
};

export default function LlenadoForm({
  checkInId,
  maquinaId,
  asignacionId,
  items,
}: {
  checkInId: string;
  maquinaId: string;
  asignacionId: string;
  items: Item[];
}) {
  const [lineas, setLineas] = useState<Record<string, Linea>>(() => {
    const init: Record<string, Linea> = {};
    for (const it of items) {
      init[it.id] = {
        surtido_item_id: it.id,
        tolva_id: it.tolvas_candidatas[0]?.id ?? "",
        cartuchos_cargados: it.cartuchos_entregados,
      };
    }
    return init;
  });
  const [foto, setFoto] = useState<File | null>(null);
  const [notas, setNotas] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function setLinea(itemId: string, patch: Partial<Linea>) {
    setLineas((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
  }

  function finalizar() {
    setError(null);
    setEstado("enviando");

    const payload = Object.values(lineas).filter((l) => l.tolva_id);
    const sinTolva = items.filter(
      (it) => it.tolvas_candidatas.length === 0 && !lineas[it.id]?.tolva_id,
    );
    if (sinTolva.length > 0) {
      setEstado("error");
      setError(
        `Estos productos no tienen tolva configurada: ${sinTolva
          .map((s) => s.producto?.sku ?? "?")
          .join(", ")}. Configúralas en admin antes de llenar.`,
      );
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("check_in_id", checkInId);
      fd.set("asignacion_id", asignacionId);
      fd.set("maquina_id", maquinaId);
      fd.set("items", JSON.stringify(payload));
      if (foto) fd.set("foto", foto);
      if (notas) fd.set("notas", notas);
      const r = await registrarLlenado(fd);
      if (!r.ok) {
        setError(r.message);
        setEstado("error");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Llenado</h2>

      <div className="space-y-3">
        {items.map((it) => {
          const l = lineas[it.id];
          return (
            <div
              key={it.id}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
            >
              <div className="font-medium text-zinc-900">
                {it.producto?.nombre}
              </div>
              <div className="font-mono text-xs text-zinc-500">
                {it.producto?.sku} · planeado {it.cartuchos_entregados}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Tolva
                  </label>
                  <select
                    value={l.tolva_id}
                    onChange={(e) =>
                      setLinea(it.id, { tolva_id: e.target.value })
                    }
                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
                  >
                    {it.tolvas_candidatas.length === 0 && (
                      <option value="">— Sin tolva —</option>
                    )}
                    {it.tolvas_candidatas.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.numero}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Cartuchos
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={it.cartuchos_entregados}
                    step={1}
                    value={l.cartuchos_cargados}
                    onChange={(e) =>
                      setLinea(it.id, {
                        cartuchos_cargados: Math.max(
                          0,
                          Number(e.target.value) || 0,
                        ),
                      })
                    }
                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
                  />
                </div>
              </div>
              {l.cartuchos_cargados < it.cartuchos_entregados && (
                <p className="mt-1 text-[11px] text-amber-700">
                  {it.cartuchos_entregados - l.cartuchos_cargados} cartucho(s)
                  para devolución de almacén.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Foto evidencia (opcional)
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-zinc-700"
        />
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notas (opcional)
        </label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={finalizar}
        disabled={estado === "enviando"}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-base font-medium text-white shadow-sm active:bg-green-800 disabled:opacity-60"
      >
        {estado === "enviando" ? "Registrando..." : "Finalizar visita"}
      </button>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <p className="text-[11px] text-zinc-500">
        Al finalizar, se descuenta inventario de cartuchos y se actualiza el
        inventario de cada tolva. Los cartuchos no usados generan una
        devolución pendiente al almacén.
      </p>
    </div>
  );
}
