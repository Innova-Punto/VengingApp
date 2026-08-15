"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { programarSustituciones } from "./actions";

export type TolvaCandidata = {
  tolva_id: string;
  numero: number;
  gramos: number;
  maquina_id: string;
  maquina: string;
  serie: string;
  ubicacion: string;
  activa: boolean;
  yaPendiente: boolean;
};

type Producto = { id: string; sku: string; nombre: string };

export default function ProgramarForm({
  productos,
  productoSeleccionado,
  candidatas,
}: {
  productos: Producto[];
  productoSeleccionado: string;
  candidatas: TolvaCandidata[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [entrante, setEntrante] = useState("");
  const [motivo, setMotivo] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const disponibles = useMemo(
    () => candidatas.filter((c) => !c.yaPendiente),
    [candidatas],
  );

  function cambiarSaliente(id: string) {
    const p = new URLSearchParams(params.toString());
    if (id) p.set("producto", id);
    else p.delete("producto");
    setSel(new Set());
    router.push(`/planeacion/sustituciones?${p.toString()}`);
  }

  function toggle(id: string) {
    setSel((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function programar() {
    setMsg(null);
    startTransition(async () => {
      const r = await programarSustituciones({
        tolvaIds: Array.from(sel),
        productoEntranteId: entrante,
        motivo: motivo.trim() || null,
      });
      setMsg({ ok: r.ok, texto: r.message });
      if (r.ok) {
        setSel(new Set());
        router.refresh();
      }
    });
  }

  const totalGramos = disponibles
    .filter((c) => sel.has(c.tolva_id))
    .reduce((s, c) => s + c.gramos, 0);

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">
        Programar cambio de sabor
      </h2>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Producto que sale
          </label>
          <select
            value={productoSeleccionado}
            onChange={(e) => cambiarSaliente(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="">— Selecciona —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Producto que entra
          </label>
          <select
            value={entrante}
            onChange={(e) => setEntrante(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          >
            <option value="">— Selecciona —</option>
            {productos
              .filter((p) => p.id !== productoSeleccionado)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.nombre}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Motivo <span className="text-zinc-400">(opcional)</span>
          </label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ej. desabasto del proveedor"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>
      </div>

      {!productoSeleccionado ? (
        <p className="text-sm text-zinc-500">
          Elige el producto que sale para ver en qué máquinas está.
        </p>
      ) : candidatas.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ninguna máquina operativa tiene ese producto en tolva.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-600">
              {candidatas.length} máquina(s) con ese producto. Ordenadas de menos
              a más inventario: <strong>conviene empezar por las de arriba</strong>,
              son las que menos polvo obligan a retirar.
            </p>
            <button
              type="button"
              onClick={() =>
                setSel(
                  sel.size === disponibles.length
                    ? new Set()
                    : new Set(disponibles.map((c) => c.tolva_id)),
                )
              }
              className="text-xs font-medium text-zinc-700 underline"
            >
              {sel.size === disponibles.length ? "Quitar todas" : "Seleccionar todas"}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-md border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 font-medium">Máquina</th>
                  <th className="px-3 py-2 font-medium">Ubicación</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Polvo a retirar
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {candidatas.map((c) => (
                  <tr
                    key={c.tolva_id}
                    className={c.yaPendiente ? "bg-amber-50/60" : ""}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        disabled={c.yaPendiente}
                        checked={sel.has(c.tolva_id)}
                        onChange={() => toggle(c.tolva_id)}
                        className="h-4 w-4 rounded border-zinc-300 disabled:opacity-40"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-xs">{c.serie}</span>
                      <span className="ml-1 text-xs text-zinc-600">
                        {c.maquina}
                      </span>
                      <span className="ml-1 text-[11px] text-zinc-400">
                        T#{c.numero}
                      </span>
                      {c.yaPendiente && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          ya programada
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-zinc-500">
                      {c.ubicacion}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                      {c.gramos.toLocaleString("es-MX")} g
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={programar}
              disabled={pending || sel.size === 0 || !entrante}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending
                ? "Programando…"
                : `Programar ${sel.size} sustitución(es)`}
            </button>
            {sel.size > 0 && (
              <span className="text-xs text-zinc-600">
                Se retirarán ~{totalGramos.toLocaleString("es-MX")} g de polvo
                que regresarán a almacén para revisión.
              </span>
            )}
          </div>
        </>
      )}

      {msg && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.texto}
        </p>
      )}
    </section>
  );
}
