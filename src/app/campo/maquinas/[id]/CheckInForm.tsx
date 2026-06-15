"use client";

import { useState, useTransition } from "react";

import { compressImage } from "@/lib/image-compress";

import { hacerCheckIn } from "./actions";

function distanciaMetros(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const f1 = (lat1 * Math.PI) / 180;
  const f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(df / 2) * Math.sin(df / 2) +
    Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export default function CheckInForm({
  asignacionId,
  maquinaId,
  serie,
  ubicacionLat,
  ubicacionLng,
}: {
  asignacionId: string;
  maquinaId: string;
  serie: string;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
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

  const distancia =
    coords && ubicacionLat != null && ubicacionLng != null
      ? distanciaMetros(coords.lat, coords.lng, ubicacionLat, ubicacionLng)
      : null;
  const fueraDeRango = distancia != null && distancia > 100;

  function pedirGps() {
    setError(null);
    setEstado("ubicando");
    if (!navigator.geolocation) {
      setEstado("idle");
      setError(
        "Tu navegador no soporta geolocalización. No puedes hacer check-in sin GPS.",
      );
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
        setError(
          (err.message || "No se pudo obtener ubicación") +
            ". Activa los permisos de ubicación e intenta de nuevo.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function enviar() {
    if (!coords) {
      setError("Captura tu ubicación antes de hacer check-in.");
      return;
    }
    // Warning visual ya está, pero no bloqueamos: el operador puede registrar
    // el check-in aunque esté fuera de rango. Queda registrado con validado=false.
    setError(null);
    setEstado("enviando");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("asignacion_id", asignacionId);
      fd.set("maquina_id", maquinaId);
      fd.set("lat", String(coords.lat));
      fd.set("lng", String(coords.lng));
      fd.set("precision_m", String(coords.precision));
      if (foto) fd.set("foto", foto);
      if (notas) fd.set("notas", notas);
      const r = await hacerCheckIn(fd);
      if (!r.ok) {
        setError(r.message);
        setEstado("error");
      }
    });
  }

  const puedeEnviar = coords !== null;

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">
          Check-in a {serie}
        </h2>
        <p className="text-xs text-zinc-500">
          La ubicación GPS es obligatoria. Debes estar a menos de 100 m de la
          máquina.
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
              ? "Obteniendo ubicación…"
              : "Capturar ubicación (obligatoria)"}
          </button>
        ) : (
          <div
            className={`rounded-md px-3 py-2 text-xs ${
              fueraDeRango ? "bg-red-50" : "bg-zinc-100"
            }`}
          >
            <div className="text-zinc-700">
              GPS: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </div>
            <div className="text-zinc-500">
              ±{Math.round(coords.precision)} m
            </div>
            {distancia != null && (
              <div
                className={`mt-1 font-medium ${
                  fueraDeRango ? "text-red-700" : "text-green-700"
                }`}
              >
                {fueraDeRango
                  ? `⚠️ Estás a ${distancia} m de la máquina (máx. 100 m)`
                  : `✓ A ${distancia} m de la máquina`}
              </div>
            )}
            {distancia == null && (
              <div className="mt-1 text-zinc-500">
                Esta ubicación no tiene coordenadas registradas (no se valida
                distancia).
              </div>
            )}
            <button
              type="button"
              onClick={pedirGps}
              className="mt-1 text-[10px] text-zinc-600 underline"
            >
              Recapturar ubicación
            </button>
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
          onChange={async (e) => {
            const f = e.target.files?.[0] ?? null;
            if (!f) {
              setFoto(null);
              return;
            }
            setFoto(await compressImage(f));
          }}
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
        disabled={!puedeEnviar || estado === "enviando" || estado === "ubicando"}
        className="w-full rounded-md bg-zinc-900 px-4 py-3 text-base font-medium text-white shadow-sm active:bg-zinc-800 disabled:opacity-50"
      >
        {estado === "enviando" ? "Registrando…" : "Hacer check-in"}
      </button>

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
