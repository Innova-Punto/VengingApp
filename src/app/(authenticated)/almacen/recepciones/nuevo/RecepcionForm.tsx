"use client";

import { useFormState, useFormStatus } from "react-dom";

import { crearRecepcion, type RecepcionResult } from "../actions";

type Item = {
  id: string;
  cantidad: number;
  recibido: number;
  pendiente: number;
  producto_sku: string;
  producto_nombre: string;
  producto_tipo: "polvo" | "vaso";
  presentacion_nombre: string;
  peso_neto_gramos: number;
  unidades_por_presentacion: number;
  costo_unitario: number;
};

const initial: RecepcionResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Registrando..." : "Registrar recepción"}
    </button>
  );
}

export default function RecepcionForm({
  ocId,
  items,
}: {
  ocId: string;
  items: Item[];
}) {
  const [state, action] = useFormState(crearRecepcion, initial);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="oc_id" value={ocId} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">
            Folio / factura del proveedor
          </label>
          <input
            name="factura_proveedor"
            placeholder="Ej. FAC-12345"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Notas</label>
          <input
            name="notas"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Producto / Presentación</th>
              <th className="px-3 py-2 text-right font-medium">Pendiente</th>
              <th className="px-3 py-2 text-right font-medium">A recibir</th>
              <th className="px-3 py-2 font-medium">Código de lote</th>
              <th className="px-3 py-2 font-medium">Caducidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((it) => {
              const totalGramosUnaUnidad =
                it.producto_tipo === "polvo"
                  ? it.peso_neto_gramos
                  : it.unidades_por_presentacion;
              const unidad =
                it.producto_tipo === "polvo" ? "g" : "u";
              return (
                <tr key={it.id} className="align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">
                      {it.producto_nombre}
                    </div>
                    <div className="font-mono text-xs text-zinc-500">
                      {it.producto_sku}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {it.presentacion_nombre} · {totalGramosUnaUnidad}
                      {unidad} c/u
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.pendiente}
                    <span className="ml-1 text-xs text-zinc-500">
                      de {it.cantidad}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      name={`recibido_${it.id}`}
                      type="number"
                      min={0}
                      max={it.pendiente}
                      step={1}
                      defaultValue={0}
                      className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      name={`lote_${it.id}`}
                      placeholder="Auto-genera si vacío"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {it.producto_tipo === "polvo" ? (
                      <input
                        name={`cad_${it.id}`}
                        type="date"
                        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                    ) : (
                      <span className="text-xs text-zinc-400">N/A</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Pon 0 (o deja en blanco) en los items que no llegaron. Si el código
        de lote queda vacío, se auto-genera como LOT-REC-XXXXXX-NN.
      </p>

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
