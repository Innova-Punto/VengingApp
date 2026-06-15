"use client";

import { useEffect } from "react";

/**
 * Boundary global del operador. Si un componente cliente crashea, en lugar
 * de quedarse con pantalla blanca el operador ve un mensaje claro con
 * opción de reintentar y de volver a la pantalla principal.
 */
export default function CampoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // En consola para debug; el operador no la verá pero el equipo sí
    // si lo conecta vía remoto.
    console.error("Campo error:", error);
  }, [error]);

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border border-red-300 bg-red-50 p-4">
        <h2 className="text-base font-semibold text-red-900">
          Algo salió mal
        </h2>
        <p className="mt-1 text-sm text-red-800">
          La pantalla no pudo cargar. Intenta lo siguiente:
        </p>
        <ol className="ml-5 mt-2 list-decimal space-y-1 text-sm text-red-800">
          <li>Toca el botón &quot;Reintentar&quot;.</li>
          <li>Si no funciona, vuelve al inicio.</li>
          <li>
            Si sigue fallando, escríbele al supervisor con captura de
            pantalla.
          </li>
        </ol>
        {error.digest && (
          <p className="mt-3 font-mono text-[10px] text-red-700">
            ID: {error.digest}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-zinc-900 px-4 py-3 text-base font-medium text-white shadow-sm active:bg-zinc-800"
        >
          Reintentar
        </button>
        <a
          href="/campo"
          className="rounded-md border border-zinc-300 bg-white px-4 py-3 text-center text-sm font-medium text-zinc-700 active:bg-zinc-50"
        >
          Ir a inicio
        </a>
      </div>
    </div>
  );
}
