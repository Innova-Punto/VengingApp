"use client";

import { useState, useTransition } from "react";

import { reabrirRuta } from "./actions";

export function ReabrirRutaButton({
  asignacionId,
  jornadaId,
}: {
  asignacionId: string;
  jornadaId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
      >
        Reabrir ruta
      </button>
      {open && (
        <Modal
          asignacionId={asignacionId}
          jornadaId={jornadaId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function Modal({
  asignacionId,
  jornadaId,
  onClose,
}: {
  asignacionId: string;
  jornadaId: string;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData();
    fd.set("asignacion_id", asignacionId);
    fd.set("jornada_id", jornadaId);
    fd.set("motivo", motivo);
    startTransition(async () => {
      const r = await reabrirRuta(fd);
      if (r?.error) setMsg(r.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Reabrir ruta</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">Esto va a:</p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>Cancelar la jornada actual (queda en histórico).</li>
            <li>Regresar la asignación a estado <strong>surtida</strong>.</li>
            <li>El operador deberá tocar &quot;Iniciar jornada&quot; otra vez.</li>
            <li>Los check-ins, llenados y pesajes ya hechos se conservan.</li>
          </ul>
        </div>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Motivo de la reapertura <span className="text-red-600">*</span>
            </span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              minLength={3}
              rows={3}
              placeholder="Ej. Se agregó una máquina, cambio de surtido, error de planeación…"
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
              disabled={pending || motivo.trim().length < 3}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {pending ? "Reabriendo…" : "Reabrir ruta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
