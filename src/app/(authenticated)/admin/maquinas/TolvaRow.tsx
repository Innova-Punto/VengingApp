"use client";

import { useFormState, useFormStatus } from "react-dom";

import { actualizarTolva, type TolvaResult } from "./actions";

type Producto = {
  id: string;
  sku: string;
  nombre: string;
  gramaje_servicio_default: number | null;
  precio_venta_default: number | null;
};

type Tolva = {
  id: string;
  numero: number;
  producto_id: string | null;
  gramaje_servicio: number | null;
  precio_venta: number | null;
  nayax_item_code: string | null;
  inventario_actual_g: number;
  capacidad_max_g: number;
};

const initial: TolvaResult | null = null;

function OcupacionBar({ actual, max }: { actual: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((actual / max) * 100)) : 0;
  const color =
    pct >= 80
      ? "bg-green-500"
      : pct >= 40
        ? "bg-amber-500"
        : pct > 0
          ? "bg-red-500"
          : "bg-zinc-300";
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
      <div
        className={`h-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "..." : "Guardar"}
    </button>
  );
}

export default function TolvaRow({
  maquinaId,
  tolva,
  productos,
  tipo,
}: {
  maquinaId: string;
  tolva: Tolva;
  productos: Producto[];
  tipo?: "polvo_directo" | "preparado";
}) {
  const [state, action] = useFormState(actualizarTolva, initial);
  const productoActual = productos.find((p) => p.id === tolva.producto_id);
  const esPreparado = tipo === "preparado";

  return (
    <tr className="align-top">
      <td className="px-2 py-2 text-center font-mono text-sm font-medium text-zinc-700">
        #{tolva.numero}
      </td>
      <td colSpan={5} className="px-2 py-2">
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={tolva.id} />
          <input type="hidden" name="maquina_id" value={maquinaId} />

          <div className="min-w-[200px] flex-1">
            <label className="text-[10px] uppercase tracking-wide text-zinc-500">
              Producto
            </label>
            <select
              name="producto_id"
              defaultValue={tolva.producto_id ?? ""}
              className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            >
              <option value="">— Vacía —</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="w-24">
            <label className="text-[10px] uppercase tracking-wide text-zinc-500">
              Gramaje
            </label>
            <input
              name="gramaje_servicio"
              type="number"
              min={1}
              step={1}
              defaultValue={
                tolva.gramaje_servicio ??
                productoActual?.gramaje_servicio_default ??
                ""
              }
              className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div className="w-24">
            <label className="text-[10px] uppercase tracking-wide text-zinc-500">
              Precio
            </label>
            <input
              name="precio_venta"
              type="number"
              min={0}
              step="0.01"
              defaultValue={
                tolva.precio_venta ??
                productoActual?.precio_venta_default ??
                ""
              }
              className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          {!esPreparado && (
            <div className="w-32">
              <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                Nayax code
              </label>
              <input
                name="nayax_item_code"
                defaultValue={tolva.nayax_item_code ?? ""}
                className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
          )}

          <div className="flex w-44 flex-col">
            <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-zinc-500">
              <span>Ocupación</span>
              <span className="tabular-nums text-zinc-700">
                {tolva.inventario_actual_g}/{tolva.capacidad_max_g}g
              </span>
            </div>
            <OcupacionBar
              actual={tolva.inventario_actual_g}
              max={tolva.capacidad_max_g}
            />
          </div>
          <SubmitButton />
        </form>
        {state && !state.ok && (
          <p className="mt-1 text-xs text-red-700">{state.message}</p>
        )}
        {state && state.ok && (
          <p className="mt-1 text-xs text-green-700">{state.message}</p>
        )}
      </td>
    </tr>
  );
}
