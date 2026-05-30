"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState } from "react";

import { crearEncartuchado, type EncResult } from "../actions";

type Producto = {
  id: string;
  sku: string;
  nombre: string;
  gramaje_cartucho_default: number;
  stock_total: number;
};

const initial: EncResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Produciendo..." : "Crear producción"}
    </button>
  );
}

export default function NuevoEncartuchadoForm({
  productos,
}: {
  productos: Producto[];
}) {
  const [state, action] = useFormState(crearEncartuchado, initial);
  const [productoId, setProductoId] = useState("");
  const [cartuchos, setCartuchos] = useState("");
  const [gramos, setGramos] = useState("");
  const [merma, setMerma] = useState("");

  const seleccionado = useMemo(
    () => productos.find((p) => p.id === productoId),
    [productoId, productos],
  );

  const gramosTotales = useMemo(() => {
    const c = Number(cartuchos) || 0;
    const g = Number(gramos) || 0;
    const m = Number(merma) || 0;
    return c * g + m;
  }, [cartuchos, gramos, merma]);

  const stockOk =
    seleccionado && gramosTotales > 0
      ? gramosTotales <= seleccionado.stock_total
      : true;

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">
          Producto <span className="text-red-600">*</span>
        </label>
        <select
          name="producto_id"
          required
          value={productoId}
          onChange={(e) => {
            setProductoId(e.target.value);
            const p = productos.find((x) => x.id === e.target.value);
            if (p && !gramos)
              setGramos(String(p.gramaje_cartucho_default));
          }}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="">— Selecciona —</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} · {p.nombre} ({p.stock_total.toLocaleString()} g
              disponibles)
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">
            Cartuchos a producir <span className="text-red-600">*</span>
          </label>
          <input
            name="cartuchos_producidos"
            type="number"
            min={1}
            step={1}
            required
            value={cartuchos}
            onChange={(e) => setCartuchos(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">
            Gramos por cartucho <span className="text-red-600">*</span>
          </label>
          <input
            name="gramos_por_cartucho"
            type="number"
            min={1}
            step={1}
            required
            value={gramos}
            onChange={(e) => setGramos(e.target.value)}
            placeholder="400"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">
            Merma (g)
          </label>
          <input
            name="gramos_merma"
            type="number"
            min={0}
            step={1}
            value={merma}
            onChange={(e) => setMerma(e.target.value)}
            placeholder="0"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-zinc-500">Gramos a consumir:</span>{" "}
            <strong>{gramosTotales.toLocaleString()} g</strong>
          </div>
          {seleccionado && (
            <div>
              <span className="text-zinc-500">Stock disponible:</span>{" "}
              <strong>
                {seleccionado.stock_total.toLocaleString()} g
              </strong>
            </div>
          )}
        </div>
        {!stockOk && (
          <p className="mt-2 text-xs text-red-700">
            Stock insuficiente. Faltan{" "}
            {(gramosTotales - (seleccionado?.stock_total ?? 0)).toLocaleString()}{" "}
            g.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">Notas</label>
        <textarea
          name="notas"
          rows={2}
          className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>

      {state && !state.ok && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
