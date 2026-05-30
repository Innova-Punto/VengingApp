"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  crearPresentacion,
  type PresentacionResult,
} from "./actions";

type Producto = { id: string; sku: string; nombre: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Agregando..." : "Agregar presentación"}
    </button>
  );
}

const initial: PresentacionResult | null = null;

export default function PresentacionForm({
  proveedorId,
  productos,
}: {
  proveedorId: string;
  productos: Producto[];
}) {
  const [state, action] = useFormState(crearPresentacion, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="proveedor_id" value={proveedorId} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <div className="md:col-span-2">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Producto *
          </label>
          <select
            name="producto_id"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">— Selecciona —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Presentación *
          </label>
          <input
            name="nombre_presentacion"
            required
            placeholder="Saco 10kg"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Peso (g) *
          </label>
          <input
            name="peso_neto_gramos"
            type="number"
            min={1}
            step={1}
            required
            placeholder="10000"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Unidades
          </label>
          <input
            name="unidades_por_presentacion"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Costo unitario *
          </label>
          <input
            name="costo_unitario"
            type="number"
            min={0}
            step="0.01"
            required
            placeholder="1500.00"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
          <label className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
            <input type="checkbox" name="costo_incluye_iva" />
            El precio capturado ya incluye IVA
          </label>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            IVA
          </label>
          <select
            name="iva_tasa"
            defaultValue="0.16"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="0.16">16% (general)</option>
            <option value="0.08">8% (frontera)</option>
            <option value="0">0% (exento)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Moneda
          </label>
          <input
            name="moneda"
            defaultValue="MXN"
            maxLength={3}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm uppercase shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div className="md:col-span-3">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            SKU del proveedor
          </label>
          <input
            name="sku_proveedor"
            placeholder="opcional"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>

      {state && !state.ok && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}
      {state && state.ok && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.message}
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
