"use client";

import { useState, useTransition } from "react";

import { subirFotoCliente } from "@/lib/storage-upload";

import CheckoutSheet, {
  type CheckoutData,
  validateCheckout,
} from "./CheckoutSheet";
import { cerrarVisitaSinLlenado } from "./actions";

type Etapa = "idle" | "subiendo_foto" | "cerrando" | "foto_fallo" | "error";

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
  const [etapa, setEtapa] = useState<Etapa>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Ejecuta el cierre con la ruta de foto que se pase (puede ser null).
  function ejecutarCierre(fotoSalidaPath: string | null) {
    setEtapa("cerrando");
    startTransition(async () => {
      const r = await cerrarVisitaSinLlenado({
        checkInId,
        asignacionId,
        maquinaId,
        notas: notas || null,
        fotoSalidaPath,
        checkoutNayaxOk: checkout.nayax_ok,
        checkoutMaquinaLimpia: checkout.maquina_limpia,
        checkoutProductosOk: checkout.productos_ok,
      });
      if (!r.ok) {
        setError(r.message);
        setEtapa("error");
      }
    });
  }

  async function intentarSubirYCerrar() {
    setError(null);

    const checkoutErr = validateCheckout(checkout);
    if (checkoutErr) {
      setError(checkoutErr);
      setEtapa("error");
      return;
    }

    // Sin foto → cierra directo
    if (!checkout.foto || checkout.foto.size === 0) {
      ejecutarCierre(null);
      return;
    }

    // Con foto → sube primero al storage, luego cierra
    setEtapa("subiendo_foto");
    try {
      const r = await subirFotoCliente({
        bucket: "evidencias-checkin",
        path: `${asignacionId}/${maquinaId}-salida-${Date.now()}`,
        file: checkout.foto,
      });
      ejecutarCierre(r.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEtapa("foto_fallo");
    }
  }

  function cerrarSinFoto() {
    setError(null);
    ejecutarCierre(null);
  }

  const enviando = etapa === "subiendo_foto" || etapa === "cerrando";

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

      {etapa === "foto_fallo" ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">
            No se pudo subir la foto (señal débil o lenta).
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={intentarSubirYCerrar}
              className="flex-1 rounded-md border border-amber-700 bg-white px-3 py-2 text-sm font-medium text-amber-900 active:bg-amber-100"
            >
              Reintentar foto
            </button>
            <button
              type="button"
              onClick={cerrarSinFoto}
              className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white active:bg-zinc-800"
            >
              Cerrar sin foto
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={intentarSubirYCerrar}
          disabled={enviando}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm active:bg-zinc-800 disabled:opacity-60"
        >
          {etapa === "subiendo_foto"
            ? "Subiendo foto..."
            : etapa === "cerrando"
              ? "Cerrando..."
              : "Finalizar visita"}
        </button>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
