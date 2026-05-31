"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { agregarItemSurtido, type ItemResult } from "../actions";

type Producto = {
  id: string;
  sku: string;
  nombre: string;
  tipo: "polvo" | "vaso";
};

const initial: ItemResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
    >
      {pending ? "Agregando..." : "Agregar"}
    </button>
  );
}

export default function AgregarItemForm({
  surtidoId,
  maquinaId,
  productos,
}: {
  surtidoId: string;
  maquinaId: string;
  productos: Producto[];
}) {
  const [state, action] = useFormState(agregarItemSurtido, initial);
  const [productoId, setProductoId] = useState<string>("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      setProductoId("");
      formRef.current?.reset();
    }
  }, [state]);

  if (productos.length === 0) {
    return (
      <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-2 text-xs text-zinc-500">
        Todos los productos de esta máquina ya están en el surtido.
      </div>
    );
  }

  const seleccionado = productos.find((p) => p.id === productoId);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-wrap items-end gap-3 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3"
    >
      <input type="hidden" name="surtido_id" value={surtidoId} />
      <input type="hidden" name="maquina_id" value={maquinaId} />

      <div className="flex flex-col">
        <label className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Agregar producto
        </label>
        <select
          name="producto_id"
          value={productoId}
          onChange={(e) => setProductoId(e.target.value)}
          required
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="">— Selecciona —</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} · {p.nombre} ({p.tipo})
            </option>
          ))}
        </select>
      </div>

      {seleccionado?.tipo === "polvo" && (
        <div className="flex flex-col">
          <label className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Cartuchos
          </label>
          <input
            name="cartuchos_entregados"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            required
            className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      )}
      {seleccionado?.tipo === "vaso" && (
        <div className="flex flex-col">
          <label className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Vasos
          </label>
          <input
            name="vasos_entregados"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            required
            className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      )}

      {seleccionado && <SubmitButton />}

      {state && !state.ok && (
        <p className="basis-full text-xs text-red-700">{state.message}</p>
      )}
      {state?.ok && (
        <p className="basis-full text-xs text-green-700">{state.message}</p>
      )}
    </form>
  );
}
