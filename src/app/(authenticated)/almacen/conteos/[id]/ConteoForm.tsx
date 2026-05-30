"use client";

import { useState, useTransition } from "react";

import { aplicarConteo } from "../actions";

type ItemGranel = {
  id: string;
  lote: string;
  producto_sku: string;
  producto_nombre: string;
  gramos_sistema: number;
  gramos_fisicos: number;
  diferencia: number;
  valor_diferencia: number;
};

type ItemCartucho = {
  id: string;
  encartuchado_folio: string;
  producto_sku: string;
  producto_nombre: string;
  cantidad_sistema: number;
  cantidad_fisica: number;
  diferencia: number;
  valor_diferencia: number;
};

export default function ConteoForm({
  conteoId,
  editable,
  granel,
  cartuchos,
}: {
  conteoId: string;
  editable: boolean;
  granel: ItemGranel[];
  cartuchos: ItemCartucho[];
}) {
  const [granelLocal, setGranelLocal] = useState(
    granel.map((g) => ({
      ...g,
      input: g.gramos_fisicos > 0 ? String(g.gramos_fisicos) : "",
    })),
  );
  const [cartuchosLocal, setCartuchosLocal] = useState(
    cartuchos.map((c) => ({
      ...c,
      input: c.cantidad_fisica > 0 ? String(c.cantidad_fisica) : "",
    })),
  );
  const [estado, setEstado] = useState<"idle" | "enviando" | "error" | "ok">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function aplicar() {
    setError(null);
    setEstado("enviando");
    const payloadGranel = granelLocal.map((g) => ({
      id: g.id,
      gramos_fisicos: Number(g.input) || 0,
    }));
    const payloadCartuchos = cartuchosLocal.map((c) => ({
      id: c.id,
      cantidad_fisica: Number(c.input) || 0,
    }));
    startTransition(async () => {
      const r = await aplicarConteo({
        conteoId,
        granel: payloadGranel,
        cartuchos: payloadCartuchos,
      });
      if (!r.ok) {
        setError(r.message);
        setEstado("error");
      } else {
        setEstado("ok");
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Granel (lotes)</h2>
        {granelLocal.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Sin granel en sistema en este momento.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Lote / Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Sistema</th>
                  <th className="px-3 py-2 text-right font-medium">Físico</th>
                  <th className="px-3 py-2 text-right font-medium">Dif.</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {granelLocal.map((g, idx) => {
                  const fisico = Number(g.input) || 0;
                  const diferencia = fisico - g.gramos_sistema;
                  return (
                    <tr key={g.id}>
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs">{g.lote}</div>
                        <div className="font-medium">{g.producto_nombre}</div>
                        <div className="font-mono text-[10px] text-zinc-500">
                          {g.producto_sku}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {g.gramos_sistema}g
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={g.input}
                          disabled={!editable}
                          onChange={(e) => {
                            const v = e.target.value;
                            setGranelLocal((prev) => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], input: v };
                              return copy;
                            });
                          }}
                          className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50"
                        />
                        <span className="ml-1 text-xs text-zinc-500">g</span>
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${
                          diferencia < 0
                            ? "text-red-700"
                            : diferencia > 0
                              ? "text-amber-700"
                              : "text-zinc-500"
                        }`}
                      >
                        {diferencia > 0 ? "+" : ""}
                        {diferencia}g
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                        {!editable
                          ? `$${g.valor_diferencia.toLocaleString("es-MX", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Cartuchos</h2>
        {cartuchosLocal.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Sin encartuchados con stock en sistema.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Encartuchado / Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Sistema</th>
                  <th className="px-3 py-2 text-right font-medium">Físico</th>
                  <th className="px-3 py-2 text-right font-medium">Dif.</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {cartuchosLocal.map((c, idx) => {
                  const fisico = Number(c.input) || 0;
                  const diferencia = fisico - c.cantidad_sistema;
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs">
                          {c.encartuchado_folio}
                        </div>
                        <div className="font-medium">{c.producto_nombre}</div>
                        <div className="font-mono text-[10px] text-zinc-500">
                          {c.producto_sku}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {c.cantidad_sistema}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={c.input}
                          disabled={!editable}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCartuchosLocal((prev) => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], input: v };
                              return copy;
                            });
                          }}
                          className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50"
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${
                          diferencia < 0
                            ? "text-red-700"
                            : diferencia > 0
                              ? "text-amber-700"
                              : "text-zinc-500"
                        }`}
                      >
                        {diferencia > 0 ? "+" : ""}
                        {diferencia}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                        {!editable
                          ? `$${c.valor_diferencia.toLocaleString("es-MX", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editable && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="mb-2 text-sm text-green-900">
            Al aplicar, se actualiza el inventario de lotes y encartuchados al
            valor físico capturado, se registra kardex de ajuste y se marca
            el conteo del cierre como completado. Esta acción no se puede
            deshacer (solo con otro conteo o ajuste manual).
          </p>
          <button
            type="button"
            onClick={aplicar}
            disabled={estado === "enviando"}
            className="w-full rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-800 disabled:opacity-60"
          >
            {estado === "enviando" ? "Aplicando..." : "Aplicar conteo"}
          </button>
          {error && (
            <p className="mt-2 text-xs text-red-700">{error}</p>
          )}
          {estado === "ok" && (
            <p className="mt-2 text-xs text-green-700">
              Conteo aplicado correctamente.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
