"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * El botón tiene que decir que está trabajando, y qué está haciendo.
 *
 * Una corrida tarda entre diez segundos y medio minuto. Sin señal, la pantalla
 * se ve idéntica antes y después de picarle: quien no sabe si apretó, aprieta
 * otra vez, y eso son dos corridas, dos cobros y dos propuestas del mismo día.
 * Ya pasó — hubo tres corridas en 46 segundos el primer día de pruebas.
 *
 * Las etapas son las de verdad y en el orden real: primero se lee el estado del
 * parque, luego el modelo decide, y al final el código ordena las paradas y
 * mide la jornada. Lo que NO se sabe es cuánto falta, así que no se finge una
 * barra de avance: se muestra el tiempo corrido, que sí es un dato cierto.
 */

const ETAPAS = [
  { desde: 0, texto: "Leyendo el estado del parque…", detalle: "inventario, ventas, quejas, agua y visitas de las 72 máquinas" },
  { desde: 4, texto: "El agente está decidiendo…", detalle: "a quién mandar a dónde, y por qué" },
  { desde: 22, texto: "Ordenando las paradas…", detalle: "ruta más corta desde el CEDIS y validación de la jornada" },
];

const TARDE = 45;

export default function GenerarButton() {
  const { pending } = useFormStatus();
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    if (!pending) {
      setSegundos(0);
      return;
    }
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  if (!pending) {
    return (
      <div className="text-right">
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Generar propuesta ahora
        </button>
        <p className="mt-1 text-xs text-zinc-500">Tarda entre 10 y 40 segundos.</p>
      </div>
    );
  }

  const etapa = [...ETAPAS].reverse().find((e) => segundos >= e.desde) ?? ETAPAS[0];
  const tarda = segundos >= TARDE;

  return (
    <div
      aria-live="polite"
      aria-busy
      className="min-w-72 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-left"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-blue-900">{etapa.texto}</div>
          <div className="text-xs text-blue-800">{etapa.detalle}</div>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-blue-700">{segundos}s</span>
      </div>

      {/* Barra indeterminada: dice "esto sigue vivo", no "vas al 60%". */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-blue-200">
        <div className="h-full w-1/3 animate-[barra_1.4s_ease-in-out_infinite] rounded-full bg-blue-600" />
      </div>

      <p className={`mt-2 text-xs ${tarda ? "font-medium text-amber-800" : "text-blue-800"}`}>
        {tarda
          ? "Se está tardando más de lo normal, pero sigue corriendo. No le piques otra vez: cada clic es una corrida nueva."
          : "Todo va bien. No le piques otra vez — cada clic es una corrida nueva."}
      </p>

      <style>{`
        @keyframes barra {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
