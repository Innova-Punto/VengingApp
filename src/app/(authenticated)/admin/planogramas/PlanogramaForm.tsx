"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";

import {
  crearPlanograma,
  actualizarPlanograma,
  type PlanogramaResult,
} from "./actions";

type Producto = {
  id: string;
  sku: string;
  nombre: string;
  gramaje_servicio_default: number | null;
  precio_venta_default: number | null;
};

type Item = {
  numero: number;
  producto_id: string | null;
  gramaje_servicio: number | null;
  precio_venta: number | null;
  nayax_item_code: string | null;
};

type Planograma = {
  id: string;
  nombre: string;
  descripcion: string | null;
  num_tolvas: number;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Guardando..." : label}
    </button>
  );
}

const initial: PlanogramaResult | null = null;

export default function PlanogramaForm({
  mode,
  planograma,
  items,
  productos,
}: {
  mode: "crear" | "editar";
  planograma?: Planograma;
  items?: Item[];
  productos: Producto[];
}) {
  const action = mode === "crear" ? crearPlanograma : actualizarPlanograma;
  const [state, formAction] = useFormState(action, initial);
  const [numTolvas, setNumTolvas] = useState(planograma?.num_tolvas ?? 8);

  const itemByNumero = new Map<number, Item>();
  (items ?? []).forEach((it) => itemByNumero.set(it.numero, it));

  return (
    <form action={formAction} className="space-y-6">
      {planograma?.id && <input type="hidden" name="id" value={planograma.id} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">
            Nombre del template <span className="text-red-600">*</span>
          </label>
          <input
            name="nombre"
            required
            defaultValue={planograma?.nombre ?? ""}
            placeholder="Estándar Gimnasios"
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">
            Número de tolvas
          </label>
          <input
            name="num_tolvas"
            type="number"
            min={1}
            max={8}
            step={1}
            value={numTolvas}
            onChange={(e) => setNumTolvas(Number(e.target.value) || 8)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
          <p className="mt-1 text-xs text-zinc-500">Entre 1 y 8.</p>
        </div>
        <div className="md:col-span-3">
          <label className="text-sm font-medium text-zinc-700">
            Descripción
          </label>
          <textarea
            name="descripcion"
            rows={2}
            defaultValue={planograma?.descripcion ?? ""}
            placeholder="Para gimnasios premium con alto tráfico"
            className="mt-1 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700">
          Configuración por tolva
        </h3>
        <p className="text-xs text-zinc-500">
          Deja una tolva vacía si no la quieres incluir en el template.
        </p>

        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2 text-center font-medium w-12">#</th>
                <th className="px-2 py-2 font-medium">Producto</th>
                <th className="px-2 py-2 font-medium w-24">Gramaje (g)</th>
                <th className="px-2 py-2 font-medium w-24">Precio</th>
                <th className="px-2 py-2 font-medium w-28">Nayax code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {Array.from({ length: numTolvas }, (_, i) => i + 1).map((n) => {
                const it = itemByNumero.get(n);
                return (
                  <tr key={n}>
                    <td className="px-2 py-2 text-center font-mono text-sm text-zinc-700">
                      #{n}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        name={`producto_id_${n}`}
                        defaultValue={it?.producto_id ?? ""}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      >
                        <option value="">— Vacía —</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        name={`gramaje_servicio_${n}`}
                        type="number"
                        min={1}
                        step={1}
                        defaultValue={it?.gramaje_servicio ?? ""}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        name={`precio_venta_${n}`}
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={it?.precio_venta ?? ""}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        name={`nayax_item_code_${n}`}
                        defaultValue={it?.nayax_item_code ?? ""}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
        <SubmitButton
          label={mode === "crear" ? "Crear planograma" : "Guardar cambios"}
        />
      </div>
    </form>
  );
}
