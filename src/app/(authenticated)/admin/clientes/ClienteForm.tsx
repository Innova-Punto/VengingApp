"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  crearCliente,
  actualizarCliente,
  type ClienteResult,
} from "./actions";

type Cliente = {
  id: string;
  nombre: string;
  razon_social: string | null;
  rfc: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_tel: string | null;
  emails_reporte: string[] | null;
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

const initial: ClienteResult | null = null;

export default function ClienteForm({
  mode,
  cliente,
}: {
  mode: "crear" | "editar";
  cliente?: Cliente;
}) {
  const action = mode === "crear" ? crearCliente : actualizarCliente;
  const [state, formAction] = useFormState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      {cliente?.id && <input type="hidden" name="id" value={cliente.id} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Nombre comercial" required full>
          <input
            name="nombre"
            required
            defaultValue={cliente?.nombre ?? ""}
            placeholder="Gimnasio FitLife"
            className="input"
          />
        </Field>

        <Field label="Razón social">
          <input
            name="razon_social"
            defaultValue={cliente?.razon_social ?? ""}
            className="input"
          />
        </Field>

        <Field label="RFC">
          <input
            name="rfc"
            defaultValue={cliente?.rfc ?? ""}
            maxLength={13}
            className="input uppercase"
          />
        </Field>

        <Field label="Contacto" hint="Nombre del contacto principal">
          <input
            name="contacto_nombre"
            defaultValue={cliente?.contacto_nombre ?? ""}
            className="input"
          />
        </Field>

        <Field label="Email de contacto">
          <input
            name="contacto_email"
            type="email"
            defaultValue={cliente?.contacto_email ?? ""}
            className="input"
          />
        </Field>

        <Field label="Teléfono">
          <input
            name="contacto_tel"
            type="tel"
            defaultValue={cliente?.contacto_tel ?? ""}
            className="input"
          />
        </Field>

        <Field
          label="Emails para reporte mensual"
          hint="Uno por línea o separados por coma. Reciben el reporte mensual de ventas."
          full
        >
          <textarea
            name="emails_reporte"
            rows={3}
            defaultValue={(cliente?.emails_reporte ?? []).join("\n")}
            placeholder="admin@cliente.com&#10;contabilidad@cliente.com"
            className="input resize-y"
          />
        </Field>

        <Field label="Notas" full>
          <textarea
            name="notas"
            rows={3}
            defaultValue={cliente?.notas ?? ""}
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
          label={mode === "crear" ? "Crear cliente" : "Guardar cambios"}
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
