"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { crearOc, type OcResult } from "../actions";

type Proveedor = { id: string; nombre: string };

const initial: OcResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creando..." : "Crear OC"}
    </button>
  );
}

export default function NuevaOcForm({
  proveedores,
}: {
  proveedores: Proveedor[];
}) {
  const [state, action] = useFormState(crearOc, initial);
  const [moneda, setMoneda] = useState<"MXN" | "USD">("MXN");

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">
          Proveedor <span className="text-red-600">*</span>
        </label>
        <select
          name="proveedor_id"
          required
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="">— Selecciona —</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">
            Fecha de emisión
          </label>
          <input
            name="fecha_emision"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">
            Fecha esperada de entrega
          </label>
          <input
            name="fecha_esperada"
            type="date"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Moneda</label>
          <select
            name="moneda"
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as "MXN" | "USD")}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="MXN">MXN — pesos</option>
            <option value="USD">USD — dólares</option>
          </select>
        </div>
        {moneda === "USD" && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">
              Tipo de cambio provisional <span className="text-red-600">*</span>
            </label>
            <input
              name="tipo_cambio"
              type="number"
              min={0}
              step="0.0001"
              required
              placeholder="ej. 18.7500"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        )}
      </div>

      {moneda === "USD" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Los costos de los items se capturan <strong>en dólares</strong>. Este
          TC es provisional para estimar el total; antes de recibir la OC
          deberás confirmar el TC real ponderado de los depósitos — sin eso, la
          recepción queda bloqueada.
        </p>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">Notas</label>
        <textarea
          name="notas"
          rows={3}
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
