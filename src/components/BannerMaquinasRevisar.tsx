import Link from "next/link";

import { UMBRAL_HORAS, type MaquinaRevisar } from "@/lib/salud-maquinas";

/**
 * Banner rojo de máquinas que requieren revisión (sin vender ≥12 h en horario
 * de operación). No renderiza nada si no hay ninguna.
 *
 * `conLink` agrega un enlace a "Salud de máquinas" (útil fuera de esa página).
 */
export function BannerMaquinasRevisar({
  items,
  conLink = false,
}: {
  items: MaquinaRevisar[];
  conLink?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-lg border border-red-300 bg-red-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-red-800">
          🚨 {items.length} máquina{items.length > 1 ? "s" : ""} requiere
          {items.length > 1 ? "n" : ""} revisión — sin vender ≥{UMBRAL_HORAS} h
          en horario de operación. Enviar operador.
        </span>
        {conLink && (
          <Link
            href="/planeacion/salud-maquinas"
            className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            Ver salud de máquinas →
          </Link>
        )}
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-red-900 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => (
          <li key={f.maquina_id} className="flex justify-between gap-2">
            <span className="truncate">
              {f.alias ?? `Serie ${f.serie}`}
              {f.ubicacion ? (
                <span className="text-red-700/70"> · {f.ubicacion}</span>
              ) : null}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {Math.round(f.horas)} h
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
