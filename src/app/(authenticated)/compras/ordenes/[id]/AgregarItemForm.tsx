"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useMemo, useState } from "react";

import { agregarItem, type ItemResult } from "../actions";

type Presentacion = {
  id: string;
  nombre_presentacion: string;
  peso_neto_gramos: number;
  unidades_por_presentacion: number;
  costo_unitario: number;
  sku_proveedor: string | null;
  producto_id: string;
  producto_sku: string;
  producto_nombre: string;
};

const initial: ItemResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Agregando..." : "Agregar"}
    </button>
  );
}

export default function AgregarItemForm({
  ocId,
  presentaciones,
}: {
  ocId: string;
  presentaciones: Presentacion[];
}) {
  const [state, action] = useFormState(agregarItem, initial);
  const [presentacionId, setPresentacionId] = useState("");
  const [cantidad, setCantidad] = useState("1");

  const seleccionada = useMemo(
    () => presentaciones.find((p) => p.id === presentacionId),
    [presentacionId, presentaciones],
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="oc_id" value={ocId} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <div className="md:col-span-3">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Presentación *
          </label>
          <select
            name="presentacion_id"
            required
            value={presentacionId}
            onChange={(e) => setPresentacionId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">— Selecciona —</option>
            {presentaciones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.producto_sku} · {p.producto_nombre} ·{" "}
                {p.nombre_presentacion} ({p.peso_neto_gramos}g)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Cantidad *
          </label>
          <input
            name="cantidad"
            type="number"
            min={1}
            step={1}
            required
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Costo unit. *
          </label>
          <input
            name="costo_unitario"
            type="number"
            min={0}
            step="0.01"
            required
            key={seleccionada?.id ?? "empty"}
            defaultValue={seleccionada?.costo_unitario ?? ""}
            placeholder="0.00"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div className="flex items-end">
          <SubmitButton />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notas
        </label>
        <input
          name="notas"
          placeholder="opcional"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
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
    </form>
  );
}
