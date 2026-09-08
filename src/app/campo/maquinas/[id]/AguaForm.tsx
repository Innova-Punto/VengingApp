"use client";

import { useState, useTransition } from "react";

import { fraccionesTanque, ML_POR_GARRAFON, mlALitros } from "@/lib/agua";

import { registrarAgua } from "./actions";

type Origen = "no" | "almacen" | "tienda";

export default function AguaForm({
  checkInId,
  asignacionId,
  maquinaId,
  capacidadMl,
  mlEstimado,
  puedeLlevarGarrafones,
}: {
  checkInId: string;
  asignacionId: string;
  maquinaId: string;
  capacidadMl: number;
  /** Lo que el sistema espera encontrar. null = nunca se ha medido. */
  mlEstimado: number | null;
  /** Si el vehículo del día carga garrafones. Las motos no. */
  puedeLlevarGarrafones: boolean;
}) {
  const [nivelMl, setNivelMl] = useState<number | null>(null);
  const [origen, setOrigen] = useState<Origen>("no");
  const [garrafones, setGarrafones] = useState("1");
  const [litros, setLitros] = useState("");
  const [costo, setCosto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [, startTransition] = useTransition();

  const opciones = fraccionesTanque(capacidadMl);

  // Lo que quedaría en el tanque según lo capturado. Si pasa de la capacidad,
  // casi siempre es que se contaron garrafones que no se vaciaron completos.
  const mlAgregados =
    origen === "almacen"
      ? Math.max(0, Number(garrafones) || 0) * ML_POR_GARRAFON
      : origen === "tienda"
        ? Math.max(0, Number(litros) || 0) * 1000
        : 0;
  const excede = nivelMl !== null && nivelMl + mlAgregados > capacidadMl;

  function enviar() {
    setError(null);

    if (nivelMl === null) {
      setError("Marca cómo encontraste el tanque.");
      return;
    }

    let carga = null as
      | { origen: "almacen"; garrafones: number }
      | { origen: "compra_operador"; litros: number; costo: number | null }
      | null;

    if (origen === "almacen") {
      const n = Number(garrafones);
      if (!Number.isFinite(n) || n < 1) {
        setError("¿Cuántos garrafones vaciaste?");
        return;
      }
      carga = { origen: "almacen", garrafones: Math.trunc(n) };
    } else if (origen === "tienda") {
      const l = Number(litros);
      if (!Number.isFinite(l) || l <= 0) {
        setError("¿Cuántos litros le echaste?");
        return;
      }
      const c = costo === "" ? null : Number(costo);
      if (c !== null && (!Number.isFinite(c) || c < 0)) {
        setError("El monto pagado no es válido.");
        return;
      }
      carga = { origen: "compra_operador", litros: l, costo: c };
    }

    setEnviando(true);
    startTransition(async () => {
      const r = await registrarAgua({
        checkInId,
        asignacionId,
        maquinaId,
        mlMedidos: nivelMl,
        carga,
        nota: null,
      });
      if (!r.ok) {
        setError(r.message);
        setEnviando(false);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-sky-300 bg-sky-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-sky-900">
          💧 Agua · tanque de {mlALitros(capacidadMl)}
        </h3>
        <p className="mt-1 text-xs text-sky-900">
          Obligatorio en cada visita. Mira el tanque <strong>antes</strong> de
          echarle agua y marca cómo lo encontraste. Es aproximado: el cuarto más
          cercano está bien.
        </p>
      </div>

      {/* ── Nivel al llegar ─────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-sky-800">
          Cómo lo encontraste
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {opciones.map((o) => {
            const activo = nivelMl === o.ml;
            return (
              <button
                key={o.etiqueta}
                type="button"
                onClick={() => setNivelMl(o.ml)}
                className={`rounded-md border px-1 py-3 text-center active:scale-95 ${
                  activo
                    ? "border-sky-700 bg-sky-700 text-white"
                    : "border-sky-300 bg-white text-sky-900"
                }`}
              >
                <div className="text-base font-semibold leading-none">
                  {o.etiqueta}
                </div>
                <div
                  className={`mt-1 text-[10px] ${activo ? "text-sky-100" : "text-zinc-500"}`}
                >
                  {mlALitros(o.ml)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Agua agregada ───────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-sky-800">
          ¿Le echaste agua?
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(
            [
              ["no", "No le eché"],
              ["almacen", "Garrafones del CEDIS"],
              ["tienda", "Compré en la tienda"],
            ] as [Origen, string][]
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setOrigen(valor)}
              className={`rounded-md border px-3 py-2 text-sm font-medium active:scale-95 ${
                origen === valor
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-sky-300 bg-white text-sky-900"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {origen === "almacen" && (
          <div className="mt-2 rounded-md border border-sky-200 bg-white p-3">
            {!puedeLlevarGarrafones && (
              <p className="mb-2 text-xs font-medium text-amber-700">
                Tu vehículo del día no trae garrafones registrados. Si de todos
                modos bajaste garrafones, captúralos y planeación lo revisa.
              </p>
            )}
            <label className="text-xs text-zinc-600">
              Garrafones que vaciaste
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={garrafones}
                onChange={(e) => setGarrafones(e.target.value)}
                className="w-24 rounded-md border border-zinc-300 px-2 py-2 text-right text-base shadow-sm focus:border-zinc-900 focus:outline-none"
              />
              <span className="text-sm text-zinc-500">
                de 20 L = {mlALitros(Math.max(0, Number(garrafones) || 0) * 20_000)}
              </span>
            </div>
          </div>
        )}

        {origen === "tienda" && (
          <div className="mt-2 space-y-2 rounded-md border border-sky-200 bg-white p-3">
            <div>
              <label className="text-xs text-zinc-600">Litros que le echaste</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                placeholder="20"
                value={litros}
                onChange={(e) => setLitros(e.target.value)}
                className="mt-1 w-28 rounded-md border border-zinc-300 px-2 py-2 text-right text-base shadow-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600">
                Cuánto pagaste (para tu reembolso)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                placeholder="45.00"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                className="mt-1 w-28 rounded-md border border-zinc-300 px-2 py-2 text-right text-base shadow-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {excede && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          En el tanque caben {mlALitros(capacidadMl)} y estás reportando{" "}
          {mlALitros((nivelMl ?? 0) + mlAgregados)}. Si algún garrafón no se
          vació completo, no lo cuentes. Si así fue, guárdalo y planeación lo
          revisa.
        </p>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="w-full rounded-md bg-sky-700 px-4 py-3 text-base font-semibold text-white active:bg-sky-800 disabled:opacity-60"
      >
        {enviando ? "Guardando…" : "Guardar agua"}
      </button>

      {mlEstimado === null && (
        <p className="text-[11px] text-sky-800">
          Es la primera medición de esta máquina: con ella arranca el control.
        </p>
      )}
    </div>
  );
}
