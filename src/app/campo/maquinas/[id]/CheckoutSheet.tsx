"use client";

import Link from "next/link";

import { compressImage } from "@/lib/image-compress";

export type CheckoutData = {
  foto: File | null;
  nayax_ok: boolean | null;
  maquina_limpia: boolean | null;
  productos_ok: boolean | null;
};

function YesNoToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-zinc-800">{label}</div>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
            value === true
              ? "border-green-700 bg-green-100 text-green-900"
              : "border-zinc-300 bg-white text-zinc-700"
          }`}
        >
          Sí
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
            value === false
              ? "border-red-700 bg-red-100 text-red-900"
              : "border-zinc-300 bg-white text-zinc-700"
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}

export default function CheckoutSheet({
  data,
  onChange,
  reportarIncidenciaHref,
}: {
  data: CheckoutData;
  onChange: (patch: Partial<CheckoutData>) => void;
  /** Href para que el operador pueda reportar incidencia si algo no está bien. */
  reportarIncidenciaHref: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-300 bg-zinc-50 p-3">
      <div className="text-sm font-semibold text-zinc-900">
        Checklist de salida
      </div>

      <YesNoToggle
        label="Nayax activo y con señal"
        value={data.nayax_ok}
        onChange={(v) => onChange({ nayax_ok: v })}
      />
      <YesNoToggle
        label="Máquina limpia"
        value={data.maquina_limpia}
        onChange={(v) => onChange({ maquina_limpia: v })}
      />
      <YesNoToggle
        label="100% productos activos en máquina"
        value={data.productos_ok}
        onChange={(v) => onChange({ productos_ok: v })}
      />

      <div>
        <label className="text-xs font-medium text-zinc-800">
          Foto de salida <span className="text-red-700">*</span>
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={async (e) => {
            const f = e.target.files?.[0] ?? null;
            onChange({ foto: f ? await compressImage(f) : null });
          }}
          className="mt-1 block w-full text-sm text-zinc-700"
        />
        {data.foto && (
          <p className="mt-1 text-[11px] text-green-700">
            ✓ Foto seleccionada: {data.foto.name}
          </p>
        )}
      </div>

      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Si algo no está bien, <Link href={reportarIncidenciaHref} className="underline font-medium">reporta tu incidencia</Link> antes de cerrar.
      </div>
    </div>
  );
}

/** Valida que la data esté completa. Devuelve mensaje de error o null. */
export function validateCheckout(data: CheckoutData): string | null {
  if (!data.foto) return "La foto de salida es obligatoria.";
  if (data.nayax_ok === null) return "Indica si Nayax está activo (sí/no).";
  if (data.maquina_limpia === null)
    return "Indica si la máquina está limpia (sí/no).";
  if (data.productos_ok === null)
    return "Indica si los productos están activos (sí/no).";
  return null;
}
