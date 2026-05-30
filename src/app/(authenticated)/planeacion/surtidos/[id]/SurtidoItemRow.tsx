"use client";

import { useFormState, useFormStatus } from "react-dom";

import { actualizarSurtidoItem, type ItemResult } from "../actions";

type Producto = { sku: string; nombre: string; tipo: "polvo" | "vaso" };

type Item = {
  id: string;
  cartuchos_sugeridos: number;
  cartuchos_entregados: number;
  vasos_sugeridos: number;
  vasos_entregados: number;
  producto: Producto | Producto[] | null;
};

const initial: ItemResult | null = null;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
    >
      {pending ? "..." : "Guardar"}
    </button>
  );
}

export default function SurtidoItemRow({
  item,
  surtidoId,
  editable,
}: {
  item: Item;
  surtidoId: string;
  editable: boolean;
}) {
  const [state, action] = useFormState(actualizarSurtidoItem, initial);
  const prod = Array.isArray(item.producto)
    ? item.producto[0]
    : item.producto;
  const esPolvo = prod?.tipo === "polvo";

  return (
    <tr className="align-top">
      <td className="px-4 py-2">
        <div className="font-medium text-zinc-900">{prod?.nombre ?? "—"}</div>
        <div className="font-mono text-xs text-zinc-500">
          {prod?.sku ?? "—"} · {prod?.tipo}
        </div>
        {state && !state.ok && (
          <p className="mt-1 text-xs text-red-700">{state.message}</p>
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
        {esPolvo ? item.cartuchos_sugeridos : "—"}
      </td>
      <td className="px-4 py-2 text-right">
        {esPolvo ? (
          <form action={action} className="inline-flex items-center gap-2">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="surtido_id" value={surtidoId} />
            <input
              type="hidden"
              name="vasos_entregados"
              value={item.vasos_entregados}
            />
            <input
              name="cartuchos_entregados"
              type="number"
              min={0}
              step={1}
              defaultValue={item.cartuchos_entregados}
              disabled={!editable}
              className="w-20 rounded-md border border-zinc-300 px-2 py-0.5 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50"
            />
            {editable && <SaveButton />}
          </form>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
        {!esPolvo ? item.vasos_sugeridos : "—"}
      </td>
      <td className="px-4 py-2 text-right">
        {!esPolvo ? (
          <form action={action} className="inline-flex items-center gap-2">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="surtido_id" value={surtidoId} />
            <input
              type="hidden"
              name="cartuchos_entregados"
              value={item.cartuchos_entregados}
            />
            <input
              name="vasos_entregados"
              type="number"
              min={0}
              step={1}
              defaultValue={item.vasos_entregados}
              disabled={!editable}
              className="w-20 rounded-md border border-zinc-300 px-2 py-0.5 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50"
            />
            {editable && <SaveButton />}
          </form>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
    </tr>
  );
}
