"use client";

import { useState, useTransition } from "react";

import { hacerCheckIn } from "./actions";

export default function CheckInForm({
  asignacionId,
  maquinaId,
  serie,
}: {
  asignacionId: string;
  maquinaId: string;
  serie: string;
}) {
  const [coords, setCoords] = useState<{
    lat: number;
    lng: number;
    precision: number;
  } | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [notas, setNotas] = useState("");
  const [estado, setEstado] = useState<
    "idle" | "ubicando" | "enviando" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function pedirGps() {
    setError(null);
    setEstado("ubicando");
    if (!navigator.geolocation) {
      setEstado("idle");
      setError("Tu navegador no soporta geolocalización.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy,
        });
        setEstado("idle");
      },
      (err) => {
        setEstado("idle");
        setError(err.message || "No se pudo obtener tu ubicación.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function enviar() {
    setError(null);
    setEstado("enviando");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("asignacion_id", asignacionId);
      fd.set("maquina_id", maquinaId);
      if (coords) {
        fd.set("lat", String(coords.lat));
        fd.set("lng", String(coords.lng));
        fd.set("precision_m", String(coords.precision));
      }
      if (foto) fd.set("foto", foto);
      if (notas) fd.set("notas", notas);
      const r = await hacerCheckIn(fd);
      if (!r.ok) {
        setError(r.message);
        setEstado("error");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">
          Check-in a {serie}
        </h2>
        <p className="text-xs text-zinc-500">
          Captura tu ubicación para registrar tu visita.
        </p>
      </div>

      <div>
        {!coords ? (
          <button
            type="button"
            onClick={pedirGps}
            disabled={estado === "ubicando"}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 active:bg-zinc-50 disabled:opacity-60"
          >
            {estado === "ubicando"
              ? "Obteniendo ubicación..."
              : "Capturar ubicación"}
          </button>
        ) : (
          <div className="rounded-md bg-zinc-100 px-3 py-2 text-xs">
            <div className="text-zinc-700">
              GPS: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </div>
            <div className="text-zinc-500">±{Math.round(coords.precision)} m</div>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Foto (opcional)
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-zinc-700"
        />
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notas (opcional)
        </label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={enviar}
        disabled={estado === "enviando" || estado === "ubicando"}
        className="w-full rounded-md bg-zinc-900 px-4 py-3 text-base font-medium text-white shadow-sm active:bg-zinc-800 disabled:opacity-60"
      >
        {estado === "enviando" ? "Registrando..." : "Hacer check-in"}
      </button>

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
