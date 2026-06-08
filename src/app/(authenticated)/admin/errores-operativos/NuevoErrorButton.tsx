"use client";

import { useState, useTransition } from "react";

import { MOTIVOS } from "@/lib/errores-operativos";

import { crearErrorOperativo } from "./actions";

type Operador = { id: string; full_name: string };
type Ruta = { id: string; nombre: string };

export function NuevoErrorButton({
  operadores,
  rutas,
  prefill,
  variant = "primary",
  label = "+ Error operativo",
}: {
  operadores: Operador[];
  rutas: Ruta[];
  prefill?: {
    operador_id?: string;
    ruta_id?: string;
    asignacion_id?: string;
    maquina_id?: string;
  };
  variant?: "primary" | "outline";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            : "rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        }
      >
        {label}
      </button>
      {open && (
        <Modal
          operadores={operadores}
          rutas={rutas}
          prefill={prefill}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function Modal({
  operadores,
  rutas,
  prefill,
  onClose,
}: {
  operadores: Operador[];
  rutas: Ruta[];
  prefill?: {
    operador_id?: string;
    ruta_id?: string;
    asignacion_id?: string;
    maquina_id?: string;
  };
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState<string>(MOTIVOS[0].value);
  const [operador, setOperador] = useState<string>(prefill?.operador_id ?? "");
  const [ruta, setRuta] = useState<string>(prefill?.ruta_id ?? "");
  const [descripcion, setDescripcion] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData();
    fd.set("motivo", motivo);
    fd.set("operador_id", operador);
    fd.set("ruta_id", ruta);
    fd.set("descripcion", descripcion);
    if (prefill?.asignacion_id) fd.set("asignacion_id", prefill.asignacion_id);
    if (prefill?.maquina_id) fd.set("maquina_id", prefill.maquina_id);
    startTransition(async () => {
      const r = await crearErrorOperativo(fd);
      if (r?.error) setMsg(r.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nuevo error operativo</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Motivo
            </span>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
            >
              {MOTIVOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Operador <span className="text-red-600">*</span>
            </span>
            <select
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
            >
              <option value="">— Selecciona —</option>
              {operadores.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Ruta
            </span>
            <select
              value={ruta}
              onChange={(e) => setRuta(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
            >
              <option value="">— Ninguna —</option>
              {rutas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Descripción
            </span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              placeholder="Detalle del error observado…"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </label>

          {msg && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {msg}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
