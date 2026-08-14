"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { crearAsignacionDinamica } from "../actions";

export type MaquinaScore = {
  maquina_id: string;
  serie: string | null;
  alias: string | null;
  tipo: string;
  cliente: string | null;
  ubicacion_id: string | null;
  ubicacion: string | null;
  ruta_id: string | null;
  ruta_nombre: string | null;
  ruta_color: string | null;
  operador_id: string | null;
  operador_nombre: string | null;
  criticidad: "critica" | "alta" | "media" | "baja" | "ok";
  revision: boolean;
  visita_vencida: boolean;
  dias_min_vaciado: number | string | null;
  horas_sin_venta: number | string | null;
  dias_sin_visita: number | string | null;
  prioridad: number;
  motivo: string | null;
};

/**
 * La unidad de la propuesta es la PARADA (ubicación): si en la sede hay
 * máquina nutri + Smart Energy, el operador atiende ambas en el mismo viaje.
 * La parada hereda la mejor prioridad de sus máquinas y el cap del día
 * cuenta paradas, no máquinas.
 */
type Parada = {
  key: string;
  ubicacion: string;
  cliente: string | null;
  maquinas: MaquinaScore[];
  prioridad: number; // la mejor (mínima) de sus máquinas
};

const PRIORIDAD_BADGE: Record<number, { label: string; cls: string }> = {
  1: { label: "Revisión", cls: "bg-purple-100 text-purple-800" },
  2: { label: "Crítica", cls: "bg-red-100 text-red-700" },
  3: { label: "Alta", cls: "bg-orange-100 text-orange-700" },
  4: { label: "Visita vencida", cls: "bg-blue-100 text-blue-700" },
  5: { label: "Media", cls: "bg-amber-100 text-amber-700" },
  6: { label: "Baja", cls: "bg-zinc-100 text-zinc-600" },
  7: { label: "Relleno", cls: "bg-zinc-50 text-zinc-400" },
};

export default function PropuestaDinamica({
  fecha,
  cap,
  maquinas,
  rutasOcupadas,
}: {
  fecha: string;
  cap: number;
  maquinas: MaquinaScore[];
  /** ruta_id → nombre de rutas que YA tienen asignación en la fecha. */
  rutasOcupadas: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );

  // Agrupa por operador titular y, dentro, por parada (ubicación)
  const grupos = useMemo(() => {
    const porOperador = new Map<
      string,
      { operadorId: string; operadorNombre: string; maquinas: MaquinaScore[] }
    >();
    for (const m of maquinas) {
      if (!m.operador_id) continue;
      const g = porOperador.get(m.operador_id) ?? {
        operadorId: m.operador_id,
        operadorNombre: m.operador_nombre ?? "(sin nombre)",
        maquinas: [],
      };
      g.maquinas.push(m);
      porOperador.set(m.operador_id, g);
    }

    return Array.from(porOperador.values())
      .map((g) => {
        const paradasMap = new Map<string, Parada>();
        for (const m of g.maquinas) {
          const key = m.ubicacion_id ?? m.maquina_id;
          const p = paradasMap.get(key) ?? {
            key,
            ubicacion: m.ubicacion ?? m.alias ?? m.serie ?? "—",
            cliente: m.cliente,
            maquinas: [],
            prioridad: 7,
          };
          p.maquinas.push(m);
          p.prioridad = Math.min(p.prioridad, m.prioridad);
          paradasMap.set(key, p);
        }
        const paradas = Array.from(paradasMap.values());
        // Nutri primero dentro de la parada; paradas por mejor prioridad
        for (const p of paradas) {
          p.maquinas.sort((a, b) =>
            a.tipo === b.tipo ? a.prioridad - b.prioridad : a.tipo === "servicio" ? 1 : -1,
          );
        }
        paradas.sort((a, b) => a.prioridad - b.prioridad);
        return { ...g, paradas };
      })
      .sort((a, b) => a.operadorNombre.localeCompare(b.operadorNombre));
  }, [maquinas]);

  const sinZona = useMemo(
    () => maquinas.filter((m) => !m.operador_id),
    [maquinas],
  );

  // Selección inicial: top `cap` PARADAS por operador
  const [seleccion, setSeleccion] = useState<Record<string, Set<string>>>(
    () => {
      const init: Record<string, Set<string>> = {};
      for (const g of grupos) {
        init[g.operadorId] = new Set(
          g.paradas.slice(0, cap).map((p) => p.key),
        );
      }
      return init;
    },
  );

  function toggle(operadorId: string, paradaKey: string) {
    setSeleccion((prev) => {
      const set = new Set(prev[operadorId] ?? []);
      if (set.has(paradaKey)) set.delete(paradaKey);
      else set.add(paradaKey);
      return { ...prev, [operadorId]: set };
    });
  }

  function confirmar() {
    setMensaje(null);
    const gruposPayload = grupos
      .map((g) => ({
        operador_id: g.operadorId,
        maquina_ids: g.paradas
          .filter((p) => seleccion[g.operadorId]?.has(p.key))
          .flatMap((p) => p.maquinas.map((m) => m.maquina_id)),
      }))
      .filter((g) => g.maquina_ids.length > 0);

    startTransition(async () => {
      const r = await crearAsignacionDinamica({ fecha, grupos: gruposPayload });
      setMensaje({ ok: r.ok, texto: r.message });
      if (r.ok) {
        router.push(`/planeacion/asignaciones?fecha=${fecha}`);
      }
    });
  }

  const totalParadas = Object.values(seleccion).reduce(
    (s, set) => s + set.size,
    0,
  );
  const totalMaquinas = grupos.reduce(
    (s, g) =>
      s +
      g.paradas
        .filter((p) => seleccion[g.operadorId]?.has(p.key))
        .reduce((x, p) => x + p.maquinas.length, 0),
    0,
  );

  // Paradas urgentes (prioridad 1-4) que quedaron FUERA de la selección
  const overflow = grupos.flatMap((g) =>
    g.paradas
      .filter(
        (p) => p.prioridad <= 4 && !seleccion[g.operadorId]?.has(p.key),
      )
      .map((p) => ({ ...p, operadorNombre: g.operadorNombre })),
  );

  return (
    <div className="space-y-6">
      {grupos.map((g) => {
        const sel = seleccion[g.operadorId] ?? new Set();
        const rutasDelGrupo = Array.from(
          new Set(g.maquinas.map((m) => m.ruta_nombre).filter(Boolean)),
        );
        const choque = Array.from(
          new Set(
            g.maquinas
              .filter((m) => m.ruta_id && rutasOcupadas[m.ruta_id])
              .map((m) => m.ruta_nombre),
          ),
        );
        return (
          <section
            key={g.operadorId}
            className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
              <div>
                <span className="font-semibold text-zinc-900">
                  {g.operadorNombre}
                </span>
                <span className="ml-2 text-xs text-zinc-500">
                  zona: {rutasDelGrupo.join(" + ")}
                </span>
              </div>
              <span
                className={`text-sm font-medium tabular-nums ${
                  sel.size > cap ? "text-red-700" : "text-zinc-700"
                }`}
              >
                {sel.size}/{cap} paradas
              </span>
            </header>

            {choque.length > 0 && (
              <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                ⚠ {choque.join(", ")} ya tiene asignación este día — si
                confirmas a este operador puede chocar. Revisa en Asignaciones.
              </p>
            )}

            <ul className="divide-y divide-zinc-100">
              {g.paradas.map((p, idx) => {
                const checked = sel.has(p.key);
                const badge =
                  PRIORIDAD_BADGE[p.prioridad] ?? PRIORIDAD_BADGE[7];
                const esPropuesta = idx < cap;
                return (
                  <li
                    key={p.key}
                    className={`flex items-start gap-3 px-4 py-2 ${
                      checked ? "" : "opacity-60"
                    } ${esPropuesta ? "" : "bg-zinc-50/60"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(g.operadorId, p.key)}
                      className="mt-1 h-4 w-4 rounded border-zinc-300"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-900">
                          {p.ubicacion}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        {p.maquinas.length > 1 && (
                          <span className="inline-flex rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-800">
                            {p.maquinas.length} máquinas en la parada
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 space-y-0.5">
                        {p.maquinas.map((m) => (
                          <div key={m.maquina_id} className="text-xs text-zinc-600">
                            <span className="font-mono font-medium text-zinc-800">
                              {m.alias ?? m.serie}
                            </span>
                            {m.tipo === "servicio" && (
                              <span className="ml-1 rounded bg-cyan-50 px-1 text-[10px] font-medium text-cyan-700">
                                servicio
                              </span>
                            )}
                            <span className="ml-1">
                              — {m.motivo || "sin señal — relleno"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {overflow.length > 0 && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-900">
            Paradas urgentes fuera de la propuesta ({overflow.length})
          </h3>
          <p className="mt-1 text-xs text-red-800">
            No cupieron en la carga del día de su operador. Opciones: palomear
            aquí arriba quitando otra parada, o mandarlas por{" "}
            <Link href="/planeacion/emergencias" className="font-medium underline">
              ruta de emergencia
            </Link>
            .
          </p>
          <ul className="mt-2 space-y-1 text-xs text-red-900">
            {overflow.map((p) => (
              <li key={p.key}>
                <span className="font-medium">{p.ubicacion}</span> (
                {p.operadorNombre}) —{" "}
                {p.maquinas.map((m) => m.motivo).filter(Boolean).join(" · ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sinZona.length > 0 && (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          {sinZona.length} máquina(s) sin ruta activa (no aparecen en ninguna
          tarjeta): {sinZona.map((m) => m.alias ?? m.serie).join(", ")}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={confirmar}
          disabled={pending || totalParadas === 0}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Creando asignaciones…"
            : `Confirmar ${totalParadas} paradas (${totalMaquinas} máquinas) en ${
                Object.values(seleccion).filter((s) => s.size > 0).length
              } asignación(es)`}
        </button>
        <span className="text-xs text-zinc-500">
          Una parada con máquina Smart Energy incluye ambas máquinas en el
          mismo viaje. Después de confirmar puedes seguir editando en el
          detalle de cada asignación.
        </span>
      </div>

      {mensaje && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            mensaje.ok
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
