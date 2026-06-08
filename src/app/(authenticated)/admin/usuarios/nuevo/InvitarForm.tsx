"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { invitarUsuario, type InviteResult } from "../actions";

const ROLES = [
  { value: "direccion", label: "Dirección" },
  { value: "compras", label: "Compras" },
  { value: "almacen", label: "Almacén" },
  { value: "planeador", label: "Planeador" },
  { value: "operador", label: "Operador" },
  { value: "admin", label: "Admin" },
];

const initial: InviteResult | null = null;

function SubmitButton({ soloLink }: { soloLink: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
        soloLink
          ? "bg-amber-700 hover:bg-amber-800"
          : "bg-zinc-900 hover:bg-zinc-800"
      }`}
    >
      {pending
        ? soloLink
          ? "Generando link..."
          : "Enviando invitación..."
        : soloLink
          ? "Generar link (no enviar email)"
          : "Enviar invitación"}
    </button>
  );
}

export default function InvitarForm() {
  const [state, action] = useFormState(invitarUsuario, initial);
  const [soloLink, setSoloLink] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  function copyLink() {
    if (linkRef.current) {
      linkRef.current.select();
      navigator.clipboard.writeText(linkRef.current.value);
    }
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="usuario@empresa.com"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="full_name"
          className="text-sm font-medium text-zinc-700"
        >
          Nombre completo
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="phone" className="text-sm font-medium text-zinc-700">
          Teléfono <span className="text-zinc-400">(opcional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-700">Roles</legend>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <label
              key={r.value}
              className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
            >
              <input type="checkbox" name="roles" value={r.value} />
              <span>{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {state && !state.ok && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}
      {state && state.ok && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          <p>{state.message}</p>
          {state.link && (
            <div className="mt-3 space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-green-800">
                Link de invitación (cópialo y compártelo)
              </label>
              <div className="flex gap-2">
                <input
                  ref={linkRef}
                  readOnly
                  value={state.link}
                  className="flex-1 rounded-md border border-green-300 bg-white px-2 py-1 text-xs font-mono text-zinc-700"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="rounded-md border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                >
                  Copiar
                </button>
              </div>
              <p className="mt-1 text-[10px] text-green-800">
                Mándaselo por WhatsApp/correo manual. Funciona una sola vez y
                expira en ~1 hora.
              </p>
            </div>
          )}
        </div>
      )}

      <input type="hidden" name="solo_link" value={soloLink ? "true" : "false"} />
      <SubmitButton soloLink={soloLink} />

      <div className="text-center">
        <button
          type="button"
          onClick={() => setSoloLink((v) => !v)}
          className="text-xs text-zinc-600 underline hover:text-zinc-900"
        >
          {soloLink
            ? "← Volver a enviar por correo"
            : "Generar link sin enviar email (bypass SMTP)"}
        </button>
      </div>
    </form>
  );
}
