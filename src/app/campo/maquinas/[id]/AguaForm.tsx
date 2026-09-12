"use client";

import { useState, useTransition } from "react";

import { fraccionesTanque, ML_POR_GARRAFON, mlALitros } from "@/lib/agua";

import { registrarAgua } from "./actions";

type Origen = "no" | "almacen" | "tienda";

/**
 * Presentaciones que el operador encuentra en la tienda. Son un atajo para
 * llenar el campo, no una lista cerrada: puede comprar cualquier cosa y
 * escribir los litros a mano. Del CEDIS siempre bajan garrafones de 20 L.
 */
const PRESENTACIONES_TIENDA = [
  { etiqueta: "Garrafón 20 L", litros: 20 },
  { etiqueta: "Garrafón 10 L", litros: 10 },
  { etiqueta: "Galón", litros: 3.8 },
];

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
  // Sin valor por defecto a propósito: si "No le eché" viniera preseleccionado,
  // un operador distraído lo pasaría de largo y nunca sabríamos si echó agua.
  const [origen, setOrigen] = useState<Origen | null>(null);
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

    if (origen === null) {
      setError("Contesta si le echaste agua o no.");
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
              ["almacen", "Garrafones del CEDIS (20 L)"],
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
              <label className="text-xs font-medium text-zinc-700">
                Litros que le echaste al tanque
              </label>
              <p className="text-[11px] text-zinc-500">
                Lo que vaciaste, no lo que compraste. Si sobró agua en la moto,
                no la cuentes aquí.
              </p>
              {/* Atajos para lo que se consigue en la tienda. El campo manda:
                  si compró otra cosa, escribe los litros y ya. */}
              <div className="mt-1 flex flex-wrap gap-1.5">
                {PRESENTACIONES_TIENDA.map((p) => {
                  const activo = Number(litros) === p.litros;
                  return (
                    <button
                      key={p.etiqueta}
                      type="button"
                      onClick={() => setLitros(String(p.litros))}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium active:scale-95 ${
                        activo
                          ? "border-sky-700 bg-sky-700 text-white"
                          : "border-zinc-300 bg-white text-zinc-700"
                      }`}
                    >
                      {p.etiqueta}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  placeholder="20"
                  value={litros}
                  onChange={(e) => setLitros(e.target.value)}
                  className="w-28 rounded-md border border-zinc-300 px-2 py-2 text-right text-base shadow-sm focus:border-zinc-900 focus:outline-none"
                />
                <span className="text-sm text-zinc-500">litros</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Si vaciaste dos garrafones completos, suma los litros: 40.
              </p>
            </div>
            <div>
              <label className="text-xs text-zinc-600">
                Cuánto pagaste por el agua (para tu reembolso)
              </label>
              <p className="text-[11px] text-zinc-500">
                Aquí sí va todo lo que compraste, aunque no lo hayas vaciado
                completo.
              </p>
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
