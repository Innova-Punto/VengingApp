"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { actualizarIncidencia, type ActionResult } from "../actions";

const initial: ActionResult | null = null;

type Producto = { id: string; sku: string; nombre: string };
type Encartuchado = {
  id: string;
  folio: string | null;
  producto_id: string;
  cantidad_disponible: number;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
    >
      {pending ? "..." : label}
    </button>
  );
}

export default function IncidenciaFormDetalle({
  id,
  estadoActual,
  requiereMerma,
  yaAutorizada,
  notasIniciales,
  productoAfectadoIdInicial,
  encartuchadoAfectadoIdInicial,
  cartuchosAfectadosIniciales,
  productos,
  encartuchados,
}: {
  id: string;
  estadoActual: string;
  requiereMerma: boolean;
  yaAutorizada: boolean;
  notasIniciales: string;
  productoAfectadoIdInicial: string;
  encartuchadoAfectadoIdInicial: string;
  cartuchosAfectadosIniciales: number;
  productos: Producto[];
  encartuchados: Encartuchado[];
}) {
  const [state, action] = useFormState(actualizarIncidencia, initial);
  const [productoAfectado, setProductoAfectado] = useState(
    productoAfectadoIdInicial,
  );
  const [encartuchadoAfectado, setEncartuchadoAfectado] = useState(
    encartuchadoAfectadoIdInicial,
  );
  const cerrada = estadoActual === "resuelta" || estadoActual === "descartada";

  const encartuchadosFiltrados = productoAfectado
    ? encartuchados.filter((e) => e.producto_id === productoAfectado)
    : [];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />

      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Inventario afectado
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-zinc-700">
              Producto afectado
            </label>
            <select
              name="producto_afectado_id"
              value={productoAfectado}
              onChange={(e) => {
                setProductoAfectado(e.target.value);
                setEncartuchadoAfectado("");
              }}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
            >
              <option value="">— Ninguno —</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-700">
              Encartuchado de origen
            </label>
            <select
              name="encartuchado_afectado_id"
              value={encartuchadoAfectado}
              onChange={(e) => setEncartuchadoAfectado(e.target.value)}
              disabled={!productoAfectado}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50"
            >
              <option value="">— Ninguno —</option>
              {encartuchadosFiltrados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.folio ?? e.id.slice(0, 8)} (disp. {e.cantidad_disponible})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-700">
              Cartuchos afectados
            </label>
            <input
              name="cartuchos_afectados"
              type="number"
              min={0}
              step={1}
              defaultValue={cartuchosAfectadosIniciales}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
        </div>
        <p className="text-[11px] text-zinc-500">
          Completa estos tres campos si la incidencia implica cartuchos que
          deben mermarse. Al autorizar, se descuenta del encartuchado y se
          registra kardex (excepto en discrepancia_devolucion, que no descuenta).
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Resolución
        </h3>
        <div>
          <label className="text-xs font-medium text-zinc-700">
            Cambiar estado
          </label>
          <select
            name="estado"
            defaultValue={estadoActual}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="abierta">Abierta</option>
            <option value="en_revision">En revisión</option>
            <option value="resuelta">Resuelta</option>
            <option value="descartada">Descartada</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-700">
            Notas de resolución
          </label>
          <textarea
            name="notas_resolucion"
            defaultValue={notasIniciales}
            rows={3}
            placeholder="Qué se hizo o por qué se descarta"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        {requiereMerma && !yaAutorizada && (
          <label className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="autorizar_merma"
              value="1"
              className="h-4 w-4"
            />
            <span className="text-amber-900">
              Autorizar la merma de los cartuchos afectados.
            </span>
          </label>
        )}
      </section>

      <Submit label="Guardar" />

      {state && !state.ok && (
        <p className="text-sm text-red-700">{state.message}</p>
      )}
      {state?.ok && <p className="text-sm text-green-700">{state.message}</p>}

      {cerrada && (
        <p className="text-xs text-zinc-500">
          Esta incidencia está cerrada. Puedes reabrirla cambiando el estado.
        </p>
      )}
    </form>
  );
}
