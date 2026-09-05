"use client";

import { useState } from "react";

/**
 * Captura del teléfono de quien se quejó.
 *
 * La lada +52 es fija y no se escribe: así el dato entra siempre igual y la
 * detección de reincidencia empata. El campo acepta exactamente 10 dígitos y
 * descarta cualquier otro carácter mientras se escribe, de modo que un pegado
 * como "+52 55 1234 5678" o "(55) 1234-5678" queda limpio solo.
 *
 * El número completo viaja al servidor para calcular la huella, pero no se
 * guarda: de la base solo salen el hash y los últimos 4 dígitos.
 */
export default function TelefonoInput({
  name = "telefono",
  defaultValue = "",
  required = true,
}: {
  name?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const [valor, setValor] = useState(defaultValue);

  // Un pegado con lada se limpia solo en vez de rebotarle el error al usuario.
  function limpiar(entrada: string): string {
    let d = entrada.replace(/\D/g, "");
    if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
    else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
    else if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
    return d.slice(0, 10);
  }

  const completo = valor.length === 10;
  const conError = valor.length > 0 && !completo;

  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium text-zinc-700">
        WhatsApp de quien se quejó
      </label>

      <div
        className={`flex items-stretch overflow-hidden rounded-md border shadow-sm focus-within:ring-1 ${
          conError
            ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500"
            : "border-zinc-300 focus-within:border-zinc-900 focus-within:ring-zinc-900"
        }`}
      >
        <span className="flex select-none items-center border-r border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-600">
          +52
        </span>
        <input
          id={name}
          name={name}
          value={valor}
          onChange={(e) => setValor(limpiar(e.target.value))}
          inputMode="numeric"
          autoComplete="off"
          required={required}
          placeholder="5512345678"
          aria-invalid={conError}
          aria-describedby={`${name}-ayuda`}
          className="w-full bg-white px-3 py-2 font-mono text-sm tracking-wide outline-none"
        />
        <span
          className={`flex select-none items-center px-3 font-mono text-xs ${
            completo ? "text-green-600" : "text-zinc-400"
          }`}
        >
          {valor.length}/10
        </span>
      </div>

      <p
        id={`${name}-ayuda`}
        className={`text-xs ${conError ? "text-red-600" : "text-zinc-500"}`}
      >
        {conError
          ? `Faltan ${10 - valor.length} dígitos.`
          : "10 dígitos sin lada. Se guarda solo la huella y los últimos 4 — el número completo no se almacena."}
      </p>
    </div>
  );
}
