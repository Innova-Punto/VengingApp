"use client";

import dynamic from "next/dynamic";

import type { PinMaquina } from "./MapaMaquinas";

// Leaflet toca `window` al importarse: solo puede montarse en cliente.
const MapaMaquinas = dynamic(() => import("./MapaMaquinas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
      Cargando mapa…
    </div>
  ),
});

export default function MapaMaquinasLazy({ pins }: { pins: PinMaquina[] }) {
  return <MapaMaquinas pins={pins} />;
}
