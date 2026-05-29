"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  crearUbicacion,
  actualizarUbicacion,
  type UbicacionResult,
} from "./actions";

type Ubicacion = {
  id: string;
  cliente_id: string;
  nombre: string;
  direccion: string | null;
  colonia: string | null;
  ciudad: string | null;
  estado: string | null;
  cp: string | null;
  lat: number | null;
  lng: number | null;
  radio_geofence_m: number;
  horario_apertura: string | null;
  horario_cierre: string | null;
  notas: string | null;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Guardando..." : label}
    </button>
  );
}

const initial: UbicacionResult | null = null;

export default function UbicacionForm({
  mode,
  clienteId,
  ubicacion,
}: {
  mode: "crear" | "editar";
  clienteId: string;
  ubicacion?: Ubicacion;
}) {
  const action = mode === "crear" ? crearUbicacion : actualizarUbicacion;
  const [state, formAction] = useFormState(action, initial);

  // Normaliza HH:MM:SS → HH:MM para los <input type="time">
  const ap = ubicacion?.horario_apertura?.slice(0, 5) ?? "";
  const ci = ubicacion?.horario_cierre?.slice(0, 5) ?? "";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="cliente_id" value={clienteId} />
      {ubicacion?.id && (
        <input type="hidden" name="id" value={ubicacion.id} />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Nombre"
          required
          hint="Ej. 'Sucursal Centro', 'Recepción Torre A'"
          full
        >
          <input
            name="nombre"
            required
            defaultValue={ubicacion?.nombre ?? ""}
            className="input"
          />
        </Field>

        <Field label="Dirección" full>
          <input
            name="direccion"
            defaultValue={ubicacion?.direccion ?? ""}
            placeholder="Av. Reforma 123, Piso 2"
            className="input"
          />
        </Field>

        <Field label="Colonia">
          <input
            name="colonia"
            defaultValue={ubicacion?.colonia ?? ""}
            className="input"
          />
        </Field>

        <Field label="Ciudad">
          <input
            name="ciudad"
            defaultValue={ubicacion?.ciudad ?? ""}
            className="input"
          />
        </Field>

        <Field label="Estado">
          <input
            name="estado"
            defaultValue={ubicacion?.estado ?? ""}
            className="input"
          />
        </Field>

        <Field label="CP">
          <input
            name="cp"
            defaultValue={ubicacion?.cp ?? ""}
            maxLength={5}
            className="input"
          />
        </Field>

        <Field
          label="Latitud"
          hint="Decimal (ej. 19.4326). Usa Google Maps para obtenerla."
        >
          <input
            name="lat"
            type="number"
            step="0.0000001"
            min={-90}
            max={90}
            defaultValue={ubicacion?.lat ?? ""}
            placeholder="19.4326"
            className="input"
          />
        </Field>

        <Field label="Longitud">
          <input
            name="lng"
            type="number"
            step="0.0000001"
            min={-180}
            max={180}
            defaultValue={ubicacion?.lng ?? ""}
            placeholder="-99.1332"
            className="input"
          />
        </Field>

        <Field
          label="Radio de geofence (m)"
          hint="Distancia máxima desde la ubicación para validar el check-in por GPS."
        >
          <input
            name="radio_geofence_m"
            type="number"
            min={0}
            step={1}
            defaultValue={ubicacion?.radio_geofence_m ?? 100}
            className="input"
          />
        </Field>

        <Field label="Horario de apertura">
          <input
            name="horario_apertura"
            type="time"
            defaultValue={ap}
            className="input"
          />
        </Field>

        <Field label="Horario de cierre">
          <input
            name="horario_cierre"
            type="time"
            defaultValue={ci}
            className="input"
          />
        </Field>

        <Field label="Notas" full>
          <textarea
            name="notas"
            rows={3}
            defaultValue={ubicacion?.notas ?? ""}
            className="input resize-y"
          />
        </Field>
      </div>

      {state && !state.ok && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}
      {state && state.ok && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <SubmitButton
          label={mode === "crear" ? "Crear ubicación" : "Guardar cambios"}
        />
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(212 212 216);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgb(24 24 27);
          box-shadow: 0 0 0 1px rgb(24 24 27);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  full,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${full ? "md:col-span-2" : ""}`}>
      <label className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
