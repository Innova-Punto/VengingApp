"use client";

import { useFormState, useFormStatus } from "react-dom";

import { crearRuta, actualizarRuta, type RutaResult } from "./actions";

type Operador = { id: string; full_name: string };

type Ruta = {
  id: string;
  nombre: string;
  descripcion: string | null;
  operador_titular_id: string | null;
  color_hex: string | null;
};

const initial: RutaResult | null = null;

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

export default function RutaForm({
  mode,
  ruta,
  operadores,
}: {
  mode: "crear" | "editar";
  ruta?: Ruta;
  operadores: Operador[];
}) {
  const action = mode === "crear" ? crearRuta : actualizarRuta;
  const [state, formAction] = useFormState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      {ruta?.id && <input type="hidden" name="id" value={ruta.id} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">
            Nombre <span className="text-red-600">*</span>
          </label>
          <input
            name="nombre"
            required
            defaultValue={ruta?.nombre ?? ""}
            placeholder="Ruta Norte CDMX"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">
            Operador titular
          </label>
          <select
            name="operador_titular_id"
            defaultValue={ruta?.operador_titular_id ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">— Ninguno —</option>
            {operadores.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">
            Quien normalmente hace esta ruta (puedes reasignar día a día).
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">
            Color
          </label>
          <input
            name="color_hex"
            type="color"
            defaultValue={ruta?.color_hex ?? "#2563eb"}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 shadow-sm"
          />
          <p className="text-xs text-zinc-500">
            Para distinguirla visualmente en el calendario.
          </p>
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">
            Descripción
          </label>
          <textarea
            name="descripcion"
            rows={2}
            defaultValue={ruta?.descripcion ?? ""}
            className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
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
        <SubmitButton label={mode === "crear" ? "Crear ruta" : "Guardar cambios"} />
      </div>
    </form>
  );
}
