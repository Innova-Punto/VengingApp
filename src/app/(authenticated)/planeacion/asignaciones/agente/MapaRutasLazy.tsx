"use client";

import dynamic from "next/dynamic";

import type { FueraMapa, RutaMapa } from "./MapaRutas";

// Leaflet toca `window` al importarse: solo puede montarse en cliente.
const MapaRutas = dynamic(() => import("./MapaRutas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
      Cargando mapa…
    </div>
  ),
});

export default function MapaRutasLazy(props: {
  rutas: RutaMapa[];
  cedis: { lat: number; lng: number } | null;
  sinAtender: FueraMapa[];
}) {
  return <MapaRutas {...props} />;
}
