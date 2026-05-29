"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  crearMaquina,
  actualizarMaquina,
  type MaquinaResult,
} from "./actions";

type Ubicacion = {
  id: string;
  nombre: string;
  cliente_nombre: string;
};

type Maquina = {
  id: string;
  serie: string;
  alias: string | null;
  ubicacion_id: string;
  modelo: string | null;
  num_tolvas: number;
  capacidad_max_tolva_g: number;
  nayax_machine_id: string | null;
  nayax_serial: string | null;
  frecuencia_visita_dias: number;
  qr_codigo: string | null;
  estado: "operativa" | "mantenimiento" | "baja";
  fecha_instalacion: string | null;
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

const initial: MaquinaResult | null = null;

export default function MaquinaForm({
  mode,
  maquina,
  ubicaciones,
}: {
  mode: "crear" | "editar";
  maquina?: Maquina;
  ubicaciones: Ubicacion[];
}) {
  const action = mode === "crear" ? crearMaquina : actualizarMaquina;
  const [state, formAction] = useFormState(action, initial);
  const isEdit = mode === "editar";

  return (
    <form action={formAction} className="space-y-4">
      {maquina?.id && <input type="hidden" name="id" value={maquina.id} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Número de serie" required>
          <input
            name="serie"
            required
            defaultValue={maquina?.serie ?? ""}
            placeholder="MX-001"
            className="input"
          />
        </Field>

        <Field label="Alias" hint="Nombre interno legible, ej. 'Recepción Polanco'">
          <input
            name="alias"
            defaultValue={maquina?.alias ?? ""}
            className="input"
          />
        </Field>

        <Field label="Ubicación" required full>
          <select
            name="ubicacion_id"
            required
            defaultValue={maquina?.ubicacion_id ?? ""}
            className="input"
          >
            <option value="">— Selecciona —</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.cliente_nombre} · {u.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Modelo">
          <input
            name="modelo"
            defaultValue={maquina?.modelo ?? ""}
            className="input"
          />
        </Field>

        <Field label="Estado">
          <select
            name="estado"
            defaultValue={maquina?.estado ?? "operativa"}
            className="input"
          >
            <option value="operativa">Operativa</option>
            <option value="mantenimiento">Mantenimiento</option>
            <option value="baja">Baja</option>
          </select>
        </Field>

        <Field
          label="Número de tolvas"
          hint={
            isEdit
              ? "Solo se puede cambiar al crear (no afecta tolvas existentes)."
              : "Entre 1 y 8."
          }
        >
          <input
            name="num_tolvas"
            type="number"
            min={1}
            max={8}
            step={1}
            disabled={isEdit}
            defaultValue={maquina?.num_tolvas ?? 8}
            className="input"
          />
        </Field>

        <Field label="Capacidad máx. por tolva (g)">
          <input
            name="capacidad_max_tolva_g"
            type="number"
            min={1}
            step={1}
            disabled={isEdit}
            defaultValue={maquina?.capacidad_max_tolva_g ?? 2000}
            className="input"
          />
        </Field>

        <Field label="Nayax machine ID" hint="ID interno en el sistema Nayax">
          <input
            name="nayax_machine_id"
            defaultValue={maquina?.nayax_machine_id ?? ""}
            className="input"
          />
        </Field>

        <Field label="Nayax serial">
          <input
            name="nayax_serial"
            defaultValue={maquina?.nayax_serial ?? ""}
            className="input"
          />
        </Field>

        <Field label="Frecuencia de visita (días)">
          <input
            name="frecuencia_visita_dias"
            type="number"
            min={1}
            step={1}
            defaultValue={maquina?.frecuencia_visita_dias ?? 7}
            className="input"
          />
        </Field>

        <Field label="Código QR" hint="Para check-in del operador">
          <input
            name="qr_codigo"
            defaultValue={maquina?.qr_codigo ?? ""}
            className="input"
          />
        </Field>

        <Field label="Fecha de instalación">
          <input
            name="fecha_instalacion"
            type="date"
            defaultValue={maquina?.fecha_instalacion ?? ""}
            className="input"
          />
        </Field>

        <Field label="Notas" full>
          <textarea
            name="notas"
            rows={3}
            defaultValue={maquina?.notas ?? ""}
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
          label={mode === "crear" ? "Crear máquina" : "Guardar cambios"}
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
        :global(.input:disabled) {
          background: rgb(244 244 245);
          color: rgb(113 113 122);
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
