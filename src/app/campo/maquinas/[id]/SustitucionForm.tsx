"use client";

import { useState, useTransition } from "react";

import { compressImage } from "@/lib/image-compress";
import { subirFotoCliente } from "@/lib/storage-upload";

import { ejecutarSustitucion } from "./actions";

export type SustitucionPendiente = {
  id: string;
  tolva_numero: number;
  producto_saliente: string;
  producto_entrante: string;
  gramos_en_tolva: number;
  motivo: string | null;
};

type Etapa = "idle" | "subiendo" | "guardando" | "error";

/**
 * Instrucción de cambio de sabor que dictó planeación. El operador NO elige:
 * solo ejecuta. Debe capturar los gramos retirados antes de poder cerrar
 * la visita (la página bloquea el llenado/cierre mientras esté pendiente).
 */
export default function SustitucionForm({
  sustitucion,
  checkInId,
  asignacionId,
  maquinaId,
}: {
  sustitucion: SustitucionPendiente;
  checkInId: string;
  asignacionId: string;
  maquinaId: string;
}) {
  const [gramos, setGramos] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [notas, setNotas] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function enviar() {
    setError(null);
    const g = Number(gramos);
    if (!Number.isFinite(g) || g < 0 || gramos.trim() === "") {
      setError("Captura cuántos gramos retiraste (usa la báscula). Si la tolva estaba vacía, escribe 0.");
      setEtapa("error");
      return;
    }

    try {
      let fotoPath: string | null = null;
      if (foto && foto.size > 0) {
        setEtapa("subiendo");
        const up = await subirFotoCliente({
          bucket: "evidencias-llenado",
          path: `${asignacionId}/${maquinaId}-sustitucion-${Date.now()}`,
          file: foto,
        });
        fotoPath = up.path;
      }

      setEtapa("guardando");
      startTransition(async () => {
        const r = await ejecutarSustitucion({
          sustitucionId: sustitucion.id,
          checkInId,
          asignacionId,
          maquinaId,
          gramosRetirados: Math.round(g),
          fotoPath,
          notas: notas.trim() || null,
        });
        if (!r.ok) {
          setError(r.message);
          setEtapa("error");
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEtapa("error");
    }
  }

  const enviando = etapa === "subiendo" || etapa === "guardando";

  return (
    <div className="space-y-3 rounded-lg border-2 border-orange-400 bg-orange-50 p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-orange-600 px-2 py-0.5 text-xs font-bold text-white">
            CAMBIO DE PRODUCTO
          </span>
          <span className="font-mono text-sm font-semibold text-orange-900">
            Tolva #{sustitucion.tolva_numero}
          </span>
        </div>
        <p className="mt-2 text-sm font-medium text-orange-900">
          Retira <strong>{sustitucion.producto_saliente}</strong> y carga{" "}
          <strong>{sustitucion.producto_entrante}</strong>.
        </p>
        {sustitucion.motivo && (
          <p className="mt-0.5 text-xs text-orange-800">
            Motivo: {sustitucion.motivo}
          </p>
        )}
      </div>

      <ol className="space-y-1 rounded-md bg-white/70 p-3 text-xs text-orange-900">
        <li>
          <strong>1.</strong> Vacía la tolva en una bolsa limpia y{" "}
          <strong>etiquétala</strong> con la serie de la máquina y la fecha.
        </li>
        <li>
          <strong>2.</strong> Pésala y captura los gramos aquí abajo.
        </li>
        <li>
          <strong>3.</strong> Carga el producto nuevo y entrega la bolsa en
          almacén al regresar.
        </li>
      </ol>

      <div>
        <label className="text-xs font-medium text-orange-900">
          Gramos retirados <span className="text-red-600">*</span>
          <span className="ml-1 font-normal text-orange-700">
            (el sistema tiene registrados ~
            {sustitucion.gramos_en_tolva.toLocaleString("es-MX")} g)
          </span>
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={gramos}
          onChange={(e) => setGramos(e.target.value)}
          placeholder="ej. 850"
          className="mt-1 w-full rounded-md border border-orange-300 px-3 py-2 text-base shadow-sm focus:border-orange-600 focus:outline-none"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-orange-900">
          Foto de la bolsa etiquetada{" "}
          <span className="text-orange-700">(recomendada)</span>
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={async (e) => {
            const f = e.target.files?.[0] ?? null;
            if (!f) return setFoto(null);
            try {
              setFoto(await compressImage(f));
            } catch {
              setFoto(f);
            }
          }}
          className="mt-1 block w-full text-sm text-orange-900"
        />
        {foto && (
          <p className="mt-1 text-[11px] text-green-700">✓ {foto.name}</p>
        )}
      </div>

      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        rows={2}
        placeholder="Notas (opcional): estado del polvo, grumos, humedad…"
        className="w-full rounded-md border border-orange-300 px-2 py-1 text-sm focus:border-orange-600 focus:outline-none"
      />

      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="w-full rounded-md bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-sm active:bg-orange-700 disabled:opacity-60"
      >
        {etapa === "subiendo"
          ? "Subiendo foto…"
          : etapa === "guardando"
            ? "Registrando…"
            : "Confirmar retiro y cambiar producto"}
      </button>

      <p className="text-[11px] text-orange-800">
        Al confirmar, la tolva queda registrada con el producto nuevo y podrás
        continuar con el llenado.
      </p>

      {error && (
        <p className="rounded-md bg-red-100 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
