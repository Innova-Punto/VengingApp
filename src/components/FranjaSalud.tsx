import Link from "next/link";

import { fmtCDMXFechaHora } from "@/lib/datetime";
import { criticosDeSalud } from "@/lib/health-checks";

/**
 * La franja de críticos, arriba de todo y en todas las pantallas internas.
 *
 * Existe por una razón muy concreta: los chequeos de salud ya existían desde
 * junio y nadie los veía. De 139 corridas, 90 traían algo en crítico y nunca
 * pasó nada — no porque a nadie le importara, sino porque vivían en una
 * pantalla a la que hay que acordarse de entrar. El caso de la caja de
 * chocolate tardó tres meses en salir a la luz por la misma razón.
 *
 * Así que el aviso deja de esperar a que lo visiten. Si no hay nada crítico no
 * pinta nada: una franja que siempre está ahí se vuelve parte del decorado y
 * en un mes nadie la ve tampoco.
 */
export default async function FranjaSalud() {
  const { criticos, ejecutadoAt } = await criticosDeSalud();
  if (criticos.length === 0) return null;

  return (
    <div className="border-b border-red-200 bg-red-50">
      <div className="mx-auto max-w-7xl px-6 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-red-900">
            {criticos.length === 1
              ? "1 cosa que revisar"
              : `${criticos.length} cosas que revisar`}
          </span>
          <span className="text-sm text-red-800">
            {criticos
              .slice(0, 3)
              .map((c) => `${c.titulo} (${c.conteo})`)
              .join(" · ")}
            {criticos.length > 3 && ` · y ${criticos.length - 3} más`}
          </span>
          <Link
            href="/admin/supervision/health"
            className="text-sm font-medium text-red-900 underline underline-offset-2 hover:text-red-700"
          >
            Ver detalle
          </Link>
          {ejecutadoAt && (
            <span className="text-xs text-red-700/80">
              corte {fmtCDMXFechaHora(ejecutadoAt)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
