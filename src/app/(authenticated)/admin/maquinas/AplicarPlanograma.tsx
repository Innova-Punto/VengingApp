"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";

import {
  aplicarPlanograma,
  type AplicarResult,
} from "../planogramas/actions";

type PlanogramaOpt = {
  id: string;
  nombre: string;
  num_tolvas: number;
  items_count: number;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Aplicando..." : "Aplicar"}
    </button>
  );
}

const initial: AplicarResult | null = null;

export default function AplicarPlanograma({
  maquinaId,
  planogramas,
}: {
  maquinaId: string;
  planogramas: PlanogramaOpt[];
}) {
  const [state, action] = useFormState(aplicarPlanograma, initial);
  const router = useRouter();

  // Refrescar la página tras un apply exitoso para que las filas de tolva
  // (componentes con defaultValue) muestren los productos recién asignados.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="mb-2 text-sm font-medium text-zinc-700">
        Aplicar planograma existente
      </h3>
      <p className="mb-3 text-xs text-zinc-500">
        Sobrescribe la configuración de las tolvas según el template
        seleccionado. Las tolvas no incluidas en el template se quedan
        como están.
      </p>

      {planogramas.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No hay planogramas activos. Crea uno en Planogramas para poder
          aplicarlo aquí.
        </p>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="maquina_id" value={maquinaId} />
          <select
            name="planograma_id"
            required
            className="flex-1 min-w-[200px] rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">— Selecciona un template —</option>
            {planogramas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.items_count}/{p.num_tolvas} tolvas)
              </option>
            ))}
          </select>
          <SubmitButton />
        </form>
      )}

      {state && !state.ok && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.message}
        </p>
      )}
      {state && state.ok && (
        <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
          {state.message}
        </p>
      )}
    </div>
  );
}
