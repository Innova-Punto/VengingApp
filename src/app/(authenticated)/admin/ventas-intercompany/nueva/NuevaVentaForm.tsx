"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { registrarVentaIntercompany, type Result } from "../actions";

type Empresa = { id: string; nombre: string };
type Producto = { id: string; sku: string; nombre: string; tipo: string };

const initial: Result | null = null;

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Registrando…" : "Registrar venta"}
    </button>
  );
}

export default function NuevaVentaForm({
  empresas,
  productos,
}: {
  empresas: Empresa[];
  productos: Producto[];
}) {
  const [state, action] = useFormState(registrarVentaIntercompany, initial);
  const [productoId, setProductoId] = useState<string>("");
  const [cantidad, setCantidad] = useState<string>("");
  const [margen, setMargen] = useState<string>("20");

  const producto = useMemo(
    () => productos.find((p) => p.id === productoId),
    [productoId, productos],
  );

  // La presentación se deriva del tipo del producto: vaso → vaso, polvo → granel.
  const presentacionFinal: "granel" | "vaso" =
    producto?.tipo === "vaso" ? "vaso" : "granel";

  const unidad = presentacionFinal === "vaso" ? "vasos" : "g";
  const cantidadNum = Number(cantidad);
  const margenNum = Number(margen);
  const valido =
    productoId.length > 0 &&
    Number.isInteger(cantidadNum) &&
    cantidadNum > 0 &&
    Number.isFinite(margenNum) &&
    margenNum >= 0;

  return (
    <form action={action} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Empresa destino *
        </label>
        <select
          name="empresa_destino_id"
          required
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="">— Selecciona —</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Producto *
          </label>
          <select
            name="producto_id"
            required
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">— Selecciona —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.nombre} {p.tipo === "vaso" ? "(vaso)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Presentación
          </label>
          <input
            type="text"
            value={
              presentacionFinal === "granel"
                ? "Granel (gramos)"
                : "Vaso (unidades)"
            }
            disabled
            className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-600"
          />
          <input
            type="hidden"
            name="presentacion"
            value={presentacionFinal}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Cantidad ({unidad}) *
          </label>
          <input
            type="number"
            name="cantidad"
            min={1}
            step={1}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder={presentacionFinal === "granel" ? "1000" : "100"}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Margen (%) *
          </label>
          <input
            type="number"
            name="margen_porcentaje"
            min={0}
            step={0.01}
            value={margen}
            onChange={(e) => setMargen(e.target.value)}
            placeholder="20"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notas (opcional)
        </label>
        <input
          type="text"
          name="notas"
          placeholder="ej. Orden #123 · Fittaste Foods"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
        El costo y la utilidad real se calculan en el servidor con el lote más
        viejo disponible (PEPS) al confirmar. Ese valor queda como snapshot en
        el registro.
      </div>

      {state && !state.ok && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <SubmitButton disabled={!valido} />
      </div>
    </form>
  );
}
