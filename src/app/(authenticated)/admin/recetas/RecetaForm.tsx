"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { actualizarReceta, crearReceta, type RecetaResult } from "./actions";

const MAX_ITEMS = 30;

type ItemConfig = {
  pa_code: string;
  nombre: string;
  precio: string;
  // Gramos por tolva (key = tolva numero, value = "30")
  gramos: Record<number, string>;
};

type Existing = {
  id: string;
  nombre: string;
  descripcion: string | null;
  num_tolvas: number;
  items: {
    nayax_item_code: string;
    nombre: string;
    precio_venta: number | null;
    ingredientes: { tolva_numero: number; gramos: number }[];
  }[];
};

function emptyItem(): ItemConfig {
  return { pa_code: "", nombre: "", precio: "", gramos: {} };
}

function fromExisting(existing: Existing): ItemConfig[] {
  return existing.items.map((it) => {
    const g: Record<number, string> = {};
    for (const ing of it.ingredientes) g[ing.tolva_numero] = String(ing.gramos);
    return {
      pa_code: it.nayax_item_code,
      nombre: it.nombre,
      precio: it.precio_venta != null ? String(it.precio_venta) : "",
      gramos: g,
    };
  });
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Guardando..." : editing ? "Guardar cambios" : "Crear receta"}
    </button>
  );
}

const initialResult: RecetaResult | null = null;

export default function RecetaForm({ existing }: { existing?: Existing }) {
  const action = existing ? actualizarReceta : crearReceta;
  const [state, formAction] = useFormState(action, initialResult);

  const [numTolvas, setNumTolvas] = useState(existing?.num_tolvas ?? 8);
  const [items, setItems] = useState<ItemConfig[]>(() =>
    existing ? fromExisting(existing) : [emptyItem()],
  );

  function updateItem(idx: number, patch: Partial<ItemConfig>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }

  function updateGramos(idx: number, tolvaNum: number, val: string) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, gramos: { ...it.gramos, [tolvaNum]: val } } : it,
      ),
    );
  }

  function addItem() {
    if (items.length >= MAX_ITEMS) return;
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const tolvaNumeros = Array.from({ length: numTolvas }, (_, i) => i + 1);

  return (
    <form action={formAction} className="space-y-6">
      {existing && <input type="hidden" name="id" value={existing.id} />}

      {/* Header */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-zinc-700">Datos de la receta</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Nombre *
            </label>
            <input
              type="text"
              name="nombre"
              required
              defaultValue={existing?.nombre ?? ""}
              placeholder="Ej. Combo Café Planet Fitness"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Tolvas en máquina
            </label>
            <input
              type="number"
              name="num_tolvas"
              min={1}
              max={8}
              value={numTolvas}
              onChange={(e) => setNumTolvas(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Descripción
          </label>
          <input
            type="text"
            name="descripcion"
            defaultValue={existing?.descripcion ?? ""}
            placeholder="Notas internas (opcional)"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>

      {/* Bebidas */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-700">
            Bebidas ({items.length})
          </h3>
          <button
            type="button"
            onClick={addItem}
            disabled={items.length >= MAX_ITEMS}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            + Agregar bebida
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Cada bebida tiene un PA Code (lo que Nayax manda), un nombre y un
          precio. Captura los gramos que toma de cada tolva — deja vacío si la
          tolva no participa en esa bebida.
        </p>

        {items.map((it, idx) => {
          const itemNum = idx + 1;
          return (
            <div
              key={idx}
              className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">
                  Bebida #{itemNum}
                </span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Eliminar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    PA Code Nayax *
                  </label>
                  <input
                    type="text"
                    name={`item_${itemNum}_pa_code`}
                    value={it.pa_code}
                    onChange={(e) => updateItem(idx, { pa_code: e.target.value })}
                    placeholder="A1"
                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm font-mono shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    name={`item_${itemNum}_nombre`}
                    value={it.nombre}
                    onChange={(e) => updateItem(idx, { nombre: e.target.value })}
                    placeholder="Moka"
                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Precio (MXN)
                  </label>
                  <input
                    type="number"
                    name={`item_${itemNum}_precio`}
                    value={it.precio}
                    min={0}
                    step="0.01"
                    onChange={(e) => updateItem(idx, { precio: e.target.value })}
                    placeholder="0.00"
                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Ingredientes — gramos por tolva
                </label>
                <div
                  className="mt-1 grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${numTolvas}, minmax(0, 1fr))`,
                  }}
                >
                  {tolvaNumeros.map((t) => (
                    <div key={t} className="text-center">
                      <div className="text-[10px] font-mono text-zinc-500">
                        Tolva #{t}
                      </div>
                      <input
                        type="number"
                        name={`item_${itemNum}_tolva_${t}_gramos`}
                        value={it.gramos[t] ?? ""}
                        min={0}
                        step={1}
                        onChange={(e) => updateGramos(idx, t, e.target.value)}
                        placeholder="0"
                        className="mt-0.5 w-full rounded-md border border-zinc-300 px-1 py-1 text-right text-xs tabular-nums shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
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
        <SubmitButton editing={!!existing} />
      </div>
    </form>
  );
}
