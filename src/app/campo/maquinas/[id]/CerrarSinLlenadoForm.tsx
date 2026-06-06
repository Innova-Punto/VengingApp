"use client";

import { useState, useTransition } from "react";

import CheckoutSheet, {
  type CheckoutData,
  validateCheckout,
} from "./CheckoutSheet";
import { cerrarVisitaSinLlenado } from "./actions";

export default function CerrarSinLlenadoForm({
  checkInId,
  asignacionId,
  maquinaId,
}: {
  checkInId: string;
  asignacionId: string;
  maquinaId: string;
}) {
  const [notas, setNotas] = useState("");
  const [checkout, setCheckout] = useState<CheckoutData>({
    foto: null,
    nayax_ok: null,
    maquina_limpia: null,
    productos_ok: null,
  });
  const [estado, setEstado] = useState<"idle" | "enviando" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function cerrar() {
    setError(null);

    const checkoutErr = validateCheckout(checkout);
    if (checkoutErr) {
      setError(checkoutErr);
      setEstado("error");
      return;
    }

    setEstado("enviando");
    startTransition(async () => {
      const r = await cerrarVisitaSinLlenado({
        checkInId,
        asignacionId,
        maquinaId,
        notas: notas || null,
        fotoSalida: checkout.foto,
        checkoutNayaxOk: checkout.nayax_ok,
        checkoutMaquinaLimpia: checkout.maquina_limpia,
        checkoutProductosOk: checkout.productos_ok,
      });
      if (!r.ok) {
        setError(r.message);
        setEstado("error");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">
          Cerrar visita sin llenado
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Usa esto si solo viniste a inspección o a reportar una incidencia.
        </p>
      </div>
      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        rows={2}
        placeholder="Notas (opcional)"
        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
      />

      <CheckoutSheet
        data={checkout}
        onChange={(patch) => setCheckout((p) => ({ ...p, ...patch }))}
        reportarIncidenciaHref={`/campo/maquinas/${maquinaId}?asignacion=${asignacionId}#incidencia`}
      />

      <button
        type="button"
        onClick={cerrar}
        disabled={estado === "enviando"}
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm active:bg-zinc-800 disabled:opacity-60"
      >
        {estado === "enviando" ? "Cerrando..." : "Finalizar visita"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
