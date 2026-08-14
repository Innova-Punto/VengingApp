"use client";

import "leaflet/dist/leaflet.css";

import Link from "next/link";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

export type PinMaquina = {
  maquina_id: string;
  nombre: string;
  cliente: string | null;
  ubicacion: string | null;
  lat: number;
  lng: number;
  criticidad: "critica" | "alta" | "media" | "baja" | "ok";
  revision: boolean;
  visita_vencida: boolean;
  motivo: string | null;
  ruta_nombre: string | null;
  operador_nombre: string | null;
};

/** Semáforo del score: revisión manda sobre la criticidad de resurtido. */
function colorDe(p: PinMaquina): string {
  if (p.revision) return "#7c3aed"; // morado — máquina muda, revisión
  if (p.criticidad === "critica") return "#dc2626"; // rojo
  if (p.criticidad === "alta") return "#ea580c"; // naranja
  if (p.criticidad === "media") return "#eab308"; // amarillo
  return "#71717a"; // gris — baja / ok
}

const CENTRO_CDMX: [number, number] = [19.4, -99.14];

export default function MapaMaquinas({ pins }: { pins: PinMaquina[] }) {
  return (
    <div className="h-[480px] w-full overflow-hidden rounded-lg border border-zinc-200">
      <MapContainer
        center={CENTRO_CDMX}
        zoom={11}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pins.map((p) => (
          <CircleMarker
            key={p.maquina_id}
            center={[p.lat, p.lng]}
            radius={p.revision || p.criticidad === "critica" ? 10 : 7}
            pathOptions={{
              color: "#ffffff",
              weight: 1.5,
              fillColor: colorDe(p),
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{p.nombre}</div>
                <div className="text-xs text-zinc-600">
                  {p.cliente ?? ""}
                  {p.cliente && p.ubicacion ? " · " : ""}
                  {p.ubicacion ?? ""}
                </div>
                {p.motivo && <div className="text-xs">{p.motivo}</div>}
                <div className="text-xs text-zinc-500">
                  {p.ruta_nombre ?? "sin ruta"} · {p.operador_nombre ?? "—"}
                </div>
                <Link
                  href={`/admin/maquinas/${p.maquina_id}`}
                  className="text-xs font-medium text-blue-700 underline"
                >
                  Ver máquina →
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
