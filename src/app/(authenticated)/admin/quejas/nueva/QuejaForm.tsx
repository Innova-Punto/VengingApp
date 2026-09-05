"use client";

import { useFormState, useFormStatus } from "react-dom";

import TelefonoInput from "../TelefonoInput";
import { crearQueja, type QuejaResult } from "../actions";

const TIPOS: Array<{ v: string; label: string; grupo: string }> = [
  { v: "cobro_sin_producto", label: "Cobró y no salió producto", grupo: "Cobro" },
  { v: "cobro_duplicado", label: "Cobro duplicado", grupo: "Cobro" },
  { v: "terminal_no_pasa", label: "Terminal no pasa", grupo: "Cobro" },
  { v: "maquina_da_agua", label: "Máquina da agua", grupo: "Producto" },
  { v: "bebida_incompleta", label: "Bebida incompleta", grupo: "Producto" },
  { v: "vaso_vacio", label: "Vaso vacío", grupo: "Producto" },
  { v: "producto_mal_estado", label: "Producto en mal estado", grupo: "Producto" },
  { v: "mal_olor", label: "Mal olor", grupo: "Producto" },
  { v: "vaso_atorado", label: "Vaso atorado", grupo: "Máquina" },
  { v: "vaso_atrapado_puerta", label: "Vaso atrapado en la puerta", grupo: "Máquina" },
  { v: "touchscreen_no_sirve", label: "Touchscreen no sirve", grupo: "Máquina" },
  { v: "maquina_en_error", label: "Máquina en error", grupo: "Máquina" },
  { v: "otro", label: "Otro (describe abajo)", grupo: "Otro" },
];

const GRUPOS = ["Cobro", "Producto", "Máquina", "Otro"];

export type MaquinaOpcion = {
  id: string;
  serie: string;
  alias: string | null;
  ubicacion: string | null;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Guardando..." : "Registrar queja"}
    </button>
  );
}

export default function QuejaForm({ maquinas }: { maquinas: MaquinaOpcion[] }) {
  const [state, action] = useFormState<QuejaResult | null, FormData>(
    crearQueja,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <TelefonoInput />

      <div className="space-y-1">
        <label htmlFor="maquina_id" className="text-sm font-medium text-zinc-700">
          Máquina
        </label>
        <select
          id="maquina_id"
          name="maquina_id"
          required
          defaultValue=""
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {maquinas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.serie} · {m.alias ?? "sin alias"}
              {m.ubicacion ? ` — ${m.ubicacion}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="tipo" className="text-sm font-medium text-zinc-700">
          Tipo de queja
        </label>
        <select
          id="tipo"
          name="tipo"
          required
          defaultValue=""
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {GRUPOS.map((g) => (
            <optgroup key={g} label={g}>
              {TIPOS.filter((t) => t.grupo === g).map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="monto_reclamado"
          className="text-sm font-medium text-zinc-700"
        >
          Monto que reclama <span className="text-zinc-400">(opcional)</span>
        </label>
        <input
          id="monto_reclamado"
          name="monto_reclamado"
          type="number"
          step="0.01"
          min={0}
          placeholder="65.00"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
        <p className="text-xs text-zinc-500">
          Lo que pide el usuario. El monto que se autoriza se define después.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="descripcion" className="text-sm font-medium text-zinc-700">
          Qué pasó
        </label>
        <textarea
          id="descripcion"
          name="descripcion"
          rows={3}
          placeholder="Lo que contó el usuario por WhatsApp."
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>

      {state && !state.ok && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}

      <Submit />
    </form>
  );
}
