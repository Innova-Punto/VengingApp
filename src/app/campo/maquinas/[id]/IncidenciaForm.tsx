"use client";

import { useState, useTransition } from "react";

import { compressImage } from "@/lib/image-compress";
import {
  INCIDENCIAS_CATALOGO,
  type IncidenciaTipo,
} from "@/lib/incidencias-catalogo";

import { reportarIncidencia } from "./actions";

const TIPOS_OPERADOR: IncidenciaTipo[] = INCIDENCIAS_CATALOGO
  .filter((i) => i.tipo !== "discrepancia_devolucion") // auto-generada por sistema
  .map((i) => i.tipo);

export default function IncidenciaForm({
  checkInId,
  maquinaId,
  asignacionId,
}: {
  checkInId: string;
  maquinaId: string;
  asignacionId: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<IncidenciaTipo>("maquina_apagada");
  const [severidad, setSeveridad] = useState<"baja" | "media" | "alta">("media");
  const [descripcion, setDescripcion] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [estado, setEstado] = useState<"idle" | "enviando" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 active:bg-amber-100"
      >
        Reportar incidencia
      </button>
    );
  }

  function enviar() {
    setError(null);
    if (descripcion.trim().length < 3) {
      setError("Describe brevemente lo que pasó.");
      return;
    }
    setEstado("enviando");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("check_in_id", checkInId);
      fd.set("maquina_id", maquinaId);
      fd.set("asignacion_id", asignacionId);
      fd.set("tipo", tipo);
      fd.set("severidad", severidad);
      fd.set("descripcion", descripcion);
      if (foto) fd.set("foto", foto);
      const r = await reportarIncidencia(fd);
      if (!r.ok) {
        setError(r.message);
        setEstado("error");
      } else {
        setAbierto(false);
        setDescripcion("");
        setFoto(null);
        setEstado("idle");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-900">
          Nueva incidencia
        </h3>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs text-amber-800 underline"
        >
          Cancelar
        </button>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-amber-900">
          Tipo
        </label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          className="mt-1 w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-amber-900 focus:outline-none"
        >
          {TIPOS_OPERADOR.map((t) => {
            const info = INCIDENCIAS_CATALOGO.find((i) => i.tipo === t);
            return (
              <option key={t} value={t}>
                {info?.label ?? t.replace(/_/g, " ")}
              </option>
            );
          })}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-amber-900">
          Severidad
        </label>
        <div className="mt-1 grid grid-cols-3 gap-1">
          {(["baja", "media", "alta"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeveridad(s)}
              className={`rounded-md border px-2 py-1.5 text-sm font-medium ${
                severidad === s
                  ? "border-amber-900 bg-amber-900 text-white"
                  : "border-amber-300 bg-white text-amber-900"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-amber-900">
          Descripción
        </label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          required
          className="mt-1 w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-amber-900 focus:outline-none"
        />
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-amber-900">
          Foto (opcional)
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={async (e) => {
            const f = e.target.files?.[0] ?? null;
            setFoto(f ? await compressImage(f) : null);
          }}
          className="mt-1 block w-full text-sm text-amber-900"
        />
      </div>

      <button
        type="button"
        onClick={enviar}
        disabled={estado === "enviando"}
        className="w-full rounded-md bg-amber-900 px-4 py-2 text-sm font-medium text-white shadow-sm active:bg-amber-950 disabled:opacity-60"
      >
        {estado === "enviando" ? "Enviando..." : "Reportar"}
      </button>

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
