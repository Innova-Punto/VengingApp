"use client";

import { useState, useTransition } from "react";

import { iniciarJornada } from "./actions";

export default function IniciarJornadaForm({
  asignacionId,
}: {
  asignacionId: string;
}) {
  const [estado, setEstado] = useState<
    "idle" | "ubicando" | "enviando" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function iniciar() {
    setError(null);
    setEstado("ubicando");

    const fallback = () => {
      setEstado("enviando");
      startTransition(async () => {
        const r = await iniciarJornada({
          asignacionId,
          lat: null,
          lng: null,
        });
        if (!r.ok) {
          setError(r.message);
          setEstado("error");
        }
      });
    };

    if (!navigator.geolocation) {
      fallback();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEstado("enviando");
        startTransition(async () => {
          const r = await iniciarJornada({
            asignacionId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          if (!r.ok) {
            setError(r.message);
            setEstado("error");
          }
        });
      },
      () => {
        // Sin permiso → continuamos sin GPS
        fallback();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={iniciar}
        disabled={estado === "ubicando" || estado === "enviando"}
        className="w-full rounded-md bg-zinc-900 px-4 py-3 text-base font-medium text-white shadow-sm active:bg-zinc-800 disabled:opacity-60"
      >
        {estado === "ubicando" && "Obteniendo ubicación..."}
        {estado === "enviando" && "Iniciando..."}
        {(estado === "idle" || estado === "error") && "Iniciar jornada"}
      </button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
