"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { aplicarReceta, type AplicarResult } from "../recetas/actions";

type RecetaOpt = {
  id: string;
  nombre: string;
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

export default function AplicarReceta({
  maquinaId,
  recetas,
}: {
  maquinaId: string;
  recetas: RecetaOpt[];
}) {
  const [state, action] = useFormState(aplicarReceta, initial);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="mb-2 text-sm font-medium text-amber-900">
        Aplicar receta (bebidas preparadas)
      </h3>
      <p className="mb-3 text-xs text-amber-900">
        Para máquinas donde una venta dispensa una bebida que mezcla varias
        tolvas (ej. café Planet Fitness). Sobrescribe la configuración previa
        de recetas de la máquina.
      </p>

      {recetas.length === 0 ? (
        <p className="text-sm text-amber-900">
          No hay recetas activas. Crea una en{" "}
          <a href="/admin/recetas" className="underline">
            /admin/recetas
          </a>{" "}
          primero.
        </p>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="maquina_id" value={maquinaId} />
          <select
            name="receta_id"
            required
            className="flex-1 min-w-[200px] rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
          >
            <option value="">— Selecciona una receta —</option>
            {recetas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre} ({r.items_count} bebidas)
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
