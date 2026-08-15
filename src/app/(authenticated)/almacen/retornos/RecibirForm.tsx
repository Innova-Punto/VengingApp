"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { fmtCDMX } from "@/lib/datetime";

import { recibirRetorno } from "./actions";

export type RetornoPendiente = {
  id: string;
  maquina: string;
  tolva: number;
  producto: string;
  gramos_retirados: number;
  valor: number;
  fecha: string | null;
  operador: string;
  notas: string | null;
};

export default function RecibirForm({ retorno }: { retorno: RetornoPendiente }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gramos, setGramos] = useState(String(retorno.gramos_retirados));
  const [caducidad, setCaducidad] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function enviar(aceptado: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await recibirRetorno({
        sustitucionId: retorno.id,
        aceptado,
        gramosRecibidos: aceptado ? Number(gramos) : null,
        motivoRechazo: aceptado ? null : motivo,
        fechaCaducidad: aceptado && caducidad ? caducidad : null,
      });
      if (!r.ok) setError(r.message);
      else router.refresh();
    });
  }

  const dif = Number(gramos) - retorno.gramos_retirados;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-zinc-900">{retorno.maquina}</div>
          <div className="text-xs text-zinc-600">
            Tolva #{retorno.tolva} · {retorno.producto}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Retirado por {retorno.operador}
            {retorno.fecha
              ? ` · ${fmtCDMX(retorno.fecha, { day: "2-digit", month: "short" })}`
              : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            {retorno.gramos_retirados.toLocaleString("es-MX")} g
          </div>
          <div className="text-xs text-zinc-500">
            ${retorno.valor.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {retorno.notas && (
        <p className="mt-2 rounded-md bg-zinc-50 px-2 py-1 text-xs italic text-zinc-600">
          Nota del operador: “{retorno.notas}”
        </p>
      )}

      {!rechazando ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-zinc-700">
                Gramos que realmente llegaron
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={gramos}
                onChange={(e) => setGramos(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
              />
              {dif !== 0 && Number.isFinite(dif) && (
                <p
                  className={`mt-1 text-[11px] ${dif < 0 ? "text-amber-700" : "text-blue-700"}`}
                >
                  {dif > 0 ? "+" : ""}
                  {dif} g respecto a lo que reportó el operador
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700">
                Caducidad del lote <span className="text-zinc-400">(opcional)</span>
              </label>
              <input
                type="date"
                value={caducidad}
                onChange={(e) => setCaducidad(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => enviar(true)}
              disabled={pending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-800 disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Aceptar y crear lote recuperado"}
            </button>
            <button
              type="button"
              onClick={() => setRechazando(true)}
              disabled={pending}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Rechazar (mal estado)
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
          <label className="text-xs font-medium text-red-900">
            ¿Por qué se rechaza? Se registrará como merma.
          </label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ej. húmedo / apelmazado / bolsa rota"
            className="w-full rounded-md border border-red-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => enviar(false)}
              disabled={pending || !motivo.trim()}
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-800 disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Confirmar rechazo"}
            </button>
            <button
              type="button"
              onClick={() => setRechazando(false)}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
