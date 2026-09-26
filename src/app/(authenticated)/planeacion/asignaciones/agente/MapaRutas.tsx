"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { COLORES } from "./colores";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
} from "react-leaflet";

export type ParadaMapa = {
  maquina_id: string;
  nombre: string;
  orden: number;
  motivo: string;
  km_desde_anterior: number;
  lat: number;
  lng: number;
};

export type RutaMapa = {
  operador_id: string;
  operador_nombre: string;
  vehiculo: string | null;
  lleva_agua: boolean;
  km_total: number;
  horas_estimadas: number;
  regresa_a_resguardo: boolean;
  paradas: ParadaMapa[];
};

export type FueraMapa = {
  maquina_id: string;
  nombre: string;
  motivo: string;
  lat: number;
  lng: number;
};

const CENTRO_CDMX: [number, number] = [19.4, -99.14];

/** Pin numerado: el número es el orden de la parada, que es lo que se lee. */
function iconoNumero(n: number, color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${color};color:#fff;width:24px;height:24px;border-radius:12px;
      display:flex;align-items:center;justify-content:center;
      font:600 12px/1 system-ui,sans-serif;border:2px solid #fff;
      box-shadow:0 1px 3px rgba(0,0,0,.4)">${n}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function iconoCedis(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      background:#18181b;color:#fff;padding:3px 7px;border-radius:4px;
      font:600 11px/1 system-ui,sans-serif;border:2px solid #fff;
      box-shadow:0 1px 3px rgba(0,0,0,.4);white-space:nowrap">CEDIS</div>`,
    iconSize: [52, 20],
    iconAnchor: [26, 10],
  });
}

export default function MapaRutas({
  rutas,
  cedis,
  sinAtender,
}: {
  rutas: RutaMapa[];
  cedis: { lat: number; lng: number } | null;
  sinAtender: FueraMapa[];
}) {
  const centro: [number, number] = cedis ? [cedis.lat, cedis.lng] : CENTRO_CDMX;

  return (
    <div className="h-[560px] w-full overflow-hidden rounded-lg border border-zinc-200">
      <MapContainer
        center={centro}
        zoom={11}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Lo que quedó fuera, en gris y chiquito: importa ver DÓNDE quedó el
            hueco, no solo cuáles fueron. Un cluster entero sin atender se ve
            de un vistazo y no se ve en una lista. */}
        {sinAtender.map((f) => (
          <CircleMarker
            key={f.maquina_id}
            center={[f.lat, f.lng]}
            radius={5}
            pathOptions={{
              color: "#a1a1aa",
              weight: 1,
              fillColor: "#d4d4d8",
              fillOpacity: 0.8,
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-medium">{f.nombre}</div>
                <div className="mt-1 text-xs text-zinc-600">Sin atender hoy</div>
                <div className="mt-1 text-xs">{f.motivo}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {rutas.map((r, i) => {
          const color = COLORES[i % COLORES.length];
          const puntos: [number, number][] = [
            ...(cedis ? [[cedis.lat, cedis.lng] as [number, number]] : []),
            ...r.paradas.map((p) => [p.lat, p.lng] as [number, number]),
            ...(cedis && r.regresa_a_resguardo
              ? [[cedis.lat, cedis.lng] as [number, number]]
              : []),
          ];

          return (
            <div key={r.operador_id}>
              <Polyline
                positions={puntos}
                pathOptions={{ color, weight: 3, opacity: 0.75 }}
              />
              {r.paradas.map((p) => (
                <Marker
                  key={p.maquina_id}
                  position={[p.lat, p.lng]}
                  icon={iconoNumero(p.orden, color)}
                >
                  <Tooltip direction="top" offset={[0, -14]}>
                    <span className="font-medium">
                      {p.orden}. {p.nombre}
                    </span>
                  </Tooltip>
                  <Popup>
                    <div className="space-y-1 text-sm">
                      <div className="font-medium">
                        {p.orden}. {p.nombre}
                      </div>
                      <div className="text-xs text-zinc-600">
                        {r.operador_nombre}
                        {r.vehiculo ? ` · ${r.vehiculo}` : ""} ·{" "}
                        {p.km_desde_anterior} km desde la anterior
                      </div>
                      <div className="text-xs">{p.motivo}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </div>
          );
        })}

        {cedis && <Marker position={[cedis.lat, cedis.lng]} icon={iconoCedis()} />}
      </MapContainer>
    </div>
  );
}
