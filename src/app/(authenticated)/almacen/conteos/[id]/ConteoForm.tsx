"use client";

import { useState, useTransition } from "react";

import { aplicarConteo } from "../actions";

type GrupoGranel = {
  producto_id: string;
  producto_sku: string;
  producto_nombre: string;
  gramos_sistema: number;
  gramos_fisicos: number;
  valor_diferencia: number;
};

type GrupoCartucho = {
  producto_id: string;
  producto_sku: string;
  producto_nombre: string;
  cantidad_sistema: number;
  cantidad_fisica: number;
  valor_diferencia: number;
};

type GrupoVaso = {
  producto_id: string;
  producto_sku: string;
  producto_nombre: string;
  unidades_sistema: number;
  unidades_fisicas: number;
  valor_diferencia: number;
};

export default function ConteoForm({
  conteoId,
  editable,
  granel,
  cartuchos,
  vasos,
}: {
  conteoId: string;
  editable: boolean;
  granel: GrupoGranel[];
  cartuchos: GrupoCartucho[];
  vasos: GrupoVaso[];
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
  const [vasosLocal, setVasosLocal] = useState(
    vasos.map((v) => ({
      ...v,
      input: v.unidades_fisicas > 0 ? String(v.unidades_fisicas) : "",
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
    // Solo se envían productos con captura (campo no vacío). Los vacíos no se
    // ajustan. El reparto entre lotes (PEPS) lo hace el servidor.
    const payloadGranel = granelLocal
      .filter((g) => g.input.trim() !== "")
      .map((g) => ({
        producto_id: g.producto_id,
        gramos_fisicos: Number(g.input) || 0,
      }));
    const payloadCartuchos = cartuchosLocal
      .filter((c) => c.input.trim() !== "")
      .map((c) => ({
        producto_id: c.producto_id,
        cantidad_fisica: Number(c.input) || 0,
      }));
    const payloadVasos = vasosLocal
      .filter((v) => v.input.trim() !== "")
      .map((v) => ({
        producto_id: v.producto_id,
        unidades_fisicas: Number(v.input) || 0,
      }));
    startTransition(async () => {
      const r = await aplicarConteo({
        conteoId,
        granel: payloadGranel,
        cartuchos: payloadCartuchos,
        vasos: payloadVasos,
      });
      if (!r.ok) {
        setError(r.message);
        setEstado("error");
      } else {
        setEstado("ok");
      }
    });
  }

  const fmtMxn = (n: number) =>
    `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Granel (por producto)
        </h2>
        <p className="text-xs text-zinc-500">
          Captura el total físico por producto (todo el almacén consolidado). El
          sistema reparte la diferencia entre los lotes por PEPS al aplicar.
        </p>
        {granelLocal.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Sin granel en sistema en este momento.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Sistema</th>
                  <th className="px-3 py-2 text-right font-medium">Físico</th>
                  <th className="px-3 py-2 text-right font-medium">Dif.</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {granelLocal.map((g, idx) => {
                  const fisico = Number(g.input) || 0;
                  const diferencia =
                    g.input.trim() === "" ? 0 : fisico - g.gramos_sistema;
                  return (
                    <tr key={g.producto_id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{g.producto_nombre}</div>
                        <div className="font-mono text-[10px] text-zinc-500">
                          {g.producto_sku}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {g.gramos_sistema.toLocaleString("es-MX")}g
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
                          className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50"
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
                        {diferencia.toLocaleString("es-MX")}g
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                        {!editable ? fmtMxn(g.valor_diferencia) : "—"}
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
        <h2 className="text-lg font-semibold tracking-tight">
          Cartuchos (por producto)
        </h2>
        <p className="text-xs text-zinc-500">
          Captura el total físico de cartuchos por producto. El reparto entre
          encartuchados se hace por PEPS al aplicar.
        </p>
        {cartuchosLocal.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Sin encartuchados con stock en sistema.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Sistema</th>
                  <th className="px-3 py-2 text-right font-medium">Físico</th>
                  <th className="px-3 py-2 text-right font-medium">Dif.</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {cartuchosLocal.map((c, idx) => {
                  const fisico = Number(c.input) || 0;
                  const diferencia =
                    c.input.trim() === "" ? 0 : fisico - c.cantidad_sistema;
                  return (
                    <tr key={c.producto_id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{c.producto_nombre}</div>
                        <div className="font-mono text-[10px] text-zinc-500">
                          {c.producto_sku}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {c.cantidad_sistema.toLocaleString("es-MX")}
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
                          className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50"
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
                        {diferencia.toLocaleString("es-MX")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                        {!editable ? fmtMxn(c.valor_diferencia) : "—"}
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
        <h2 className="text-lg font-semibold tracking-tight">
          Vasos (por producto)
        </h2>
        <p className="text-xs text-zinc-500">
          Captura el total físico de vasos por producto. El reparto entre lotes
          se hace por PEPS al aplicar.
        </p>
        {vasosLocal.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Sin vasos en sistema en este momento.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Sistema</th>
                  <th className="px-3 py-2 text-right font-medium">Físico</th>
                  <th className="px-3 py-2 text-right font-medium">Dif.</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {vasosLocal.map((v, idx) => {
                  const fisico = Number(v.input) || 0;
                  const diferencia =
                    v.input.trim() === "" ? 0 : fisico - v.unidades_sistema;
                  return (
                    <tr key={v.producto_id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{v.producto_nombre}</div>
                        <div className="font-mono text-[10px] text-zinc-500">
                          {v.producto_sku}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {v.unidades_sistema.toLocaleString("es-MX")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={v.input}
                          disabled={!editable}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVasosLocal((prev) => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], input: val };
                              return copy;
                            });
                          }}
                          className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50"
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
                        {diferencia.toLocaleString("es-MX")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                        {!editable ? fmtMxn(v.valor_diferencia) : "—"}
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
            Al aplicar, se actualiza el inventario al físico capturado por
            producto (la diferencia se reparte entre lotes/encartuchados por
            PEPS), se registra kardex de ajuste y se marca el conteo del cierre
            como completado. Los productos que dejes en blanco no se ajustan.
            Esta acción no se puede deshacer (solo con otro conteo o ajuste
            manual).
          </p>
          <button
            type="button"
            onClick={aplicar}
            disabled={estado === "enviando"}
            className="w-full rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-800 disabled:opacity-60"
          >
            {estado === "enviando" ? "Aplicando..." : "Aplicar conteo"}
          </button>
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
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
