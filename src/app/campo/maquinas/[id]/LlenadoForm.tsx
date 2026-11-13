"use client";

import { useState, useTransition } from "react";

import { compressImage } from "@/lib/image-compress";
import { subirFotoCliente } from "@/lib/storage-upload";

import CheckoutSheet, {
  type CheckoutData,
  validateCheckout,
} from "./CheckoutSheet";
import { registrarLlenado } from "./actions";

type Etapa = "idle" | "subiendo_foto" | "cerrando" | "foto_fallo" | "error";

type TolvaCandidata = {
  id: string;
  numero: number;
  gramaje_servicio: number | null;
  inventario_actual_g: number | null;
  capacidad_g: number | null;
};

type Item = {
  id: string;
  producto_id: string;
  cartuchos_entregados: number;
  encartuchado_id: string | null;
  producto: { sku: string; nombre: string; tipo: string } | null;
  tolvas_candidatas: TolvaCandidata[];
  gramos_por_cartucho: number | null;
  es_vaso: boolean;
};

/**
 * ¿Esta carga deja la tolva arriba del doble de su capacidad?
 *
 * Es el mismo umbral que frena el trigger `trg_llenado_no_desborda` en la base.
 * Aquí se repite a propósito: la base es la que manda —ahí no hay forma de
 * esquivarlo— pero enterarse hasta que truena el guardado significa que el
 * operador ya vació la bolsa. Esto se lo dice antes, en el gimnasio, cuando
 * todavía puede no hacerlo.
 *
 * Pasarse un poco no cuenta. Un cartucho de 400 g entrando a una tolva casi
 * llena se pasa por decenas de gramos y es normal; al doble nunca es normal.
 */
function noCabe(
  tolva: TolvaCandidata | undefined,
  gramosPorCartucho: number | null,
  cartuchos: number,
): { quedaria: number; capacidad: number } | null {
  if (!tolva || !gramosPorCartucho || cartuchos <= 0) return null;
  const cap = tolva.capacidad_g ?? 0;
  if (cap <= 0) return null;
  const quedaria = (tolva.inventario_actual_g ?? 0) + cartuchos * gramosPorCartucho;
  return quedaria > cap * 2 ? { quedaria, capacidad: cap } : null;
}

type Linea = {
  surtido_item_id: string;
  tolva_id: string;
  cartuchos_cargados: number;
};

export default function LlenadoForm({
  checkInId,
  maquinaId,
  asignacionId,
  items,
}: {
  checkInId: string;
  maquinaId: string;
  asignacionId: string;
  items: Item[];
}) {
  const [lineas, setLineas] = useState<Record<string, Linea>>(() => {
    const init: Record<string, Linea> = {};
    for (const it of items) {
      init[it.id] = {
        surtido_item_id: it.id,
        tolva_id: it.es_vaso ? "" : (it.tolvas_candidatas[0]?.id ?? ""),
        cartuchos_cargados: it.cartuchos_entregados,
      };
    }
    return init;
  });
  const [foto, setFoto] = useState<File | null>(null);
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

  function setLinea(itemId: string, patch: Partial<Linea>) {
    setLineas((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
  }

  // Ejecuta el llenado con las rutas de fotos (pueden ser null si el
  // operador eligió cerrar sin foto o si no subió ninguna).
  function ejecutarLlenado(
    fotoUrl: string | null,
    fotoSalidaUrl: string | null,
  ) {
    // Separar items de cartucho (con tolva) y de vasos
    const cartuchoItems = items.filter((it) => !it.es_vaso);
    const vasoItems = items.filter((it) => it.es_vaso);

    const payloadCartuchos = cartuchoItems
      .map((it) => lineas[it.id])
      .filter((l) => l && l.tolva_id);

    const vasosCargados = vasoItems.reduce(
      (s, it) => s + (lineas[it.id]?.cartuchos_cargados ?? 0),
      0,
    );
    // Lo planeado va aparte de lo cargado: el servidor lo usa para distinguir
    // "no cargué nada" (válido, todo se devuelve) de "no había nada que cargar".
    const vasosPlaneados = vasoItems.reduce(
      (s, it) => s + it.cartuchos_entregados,
      0,
    );

    setEtapa("cerrando");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("check_in_id", checkInId);
      fd.set("asignacion_id", asignacionId);
      fd.set("maquina_id", maquinaId);
      fd.set("items", JSON.stringify(payloadCartuchos));
      fd.set("vasos_cargados", String(vasosCargados));
      fd.set("vasos_planeados", String(vasosPlaneados));
      if (fotoUrl) fd.set("foto_url", fotoUrl);
      if (fotoSalidaUrl) fd.set("foto_salida_url", fotoSalidaUrl);
      if (notas) fd.set("notas", notas);
      fd.set("checkout_nayax_ok", String(checkout.nayax_ok));
      fd.set("checkout_maquina_limpia", String(checkout.maquina_limpia));
      fd.set("checkout_productos_ok", String(checkout.productos_ok));
      const r = await registrarLlenado(fd);
      if (!r.ok) {
        setError(r.message);
        setEtapa("error");
      }
    });
  }

  async function intentarSubirYFinalizar() {
    setError(null);

    const checkoutErr = validateCheckout(checkout);
    if (checkoutErr) {
      setError(checkoutErr);
      setEtapa("error");
      return;
    }

    const sinTolva = items
      .filter((it) => !it.es_vaso)
      .filter(
        (it) => it.tolvas_candidatas.length === 0 && !lineas[it.id]?.tolva_id,
      );
    if (sinTolva.length > 0) {
      setEtapa("error");
      setError(
        `Estos productos no tienen tolva configurada: ${sinTolva
          .map((s) => s.producto?.sku ?? "?")
          .join(", ")}. Configúralas en admin antes de llenar.`,
      );
      return;
    }

    // Lo mismo que frena la base, pero antes de que se vacíe la bolsa.
    const desborda = items
      .filter((it) => !it.es_vaso)
      .map((it) => {
        const l = lineas[it.id];
        const t = it.tolvas_candidatas.find((c) => c.id === l?.tolva_id);
        const r = noCabe(t, it.gramos_por_cartucho, l?.cartuchos_cargados ?? 0);
        return r ? { it, t: t!, ...r } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (desborda.length > 0) {
      const d = desborda[0];
      setEtapa("error");
      setError(
        `No cargues el cartucho de ${d.it.producto?.sku ?? "este producto"}: en la tolva ${d.t.numero} caben ${d.capacidad} g y quedarían ${d.quedaria} g, más del doble. ` +
          `Casi siempre es un gramaje mal capturado en almacén, no un problema de la máquina. ` +
          `Pon 0 cartuchos en ese renglón, levanta una incidencia y sigue con el resto de la visita.`,
      );
      return;
    }

    setEtapa("subiendo_foto");

    // Subimos en paralelo ambas fotos (si existen). Si alguna falla
    // mostramos el banner de reintento — el operador puede reintentar
    // las fotos o seguir sin ellas.
    try {
      const [fotoUrl, fotoSalidaUrl] = await Promise.all([
        foto && foto.size > 0
          ? subirFotoCliente({
              bucket: "evidencias-llenado",
              path: `${asignacionId}/${maquinaId}-llenado-${Date.now()}`,
              file: foto,
            }).then((r) => r.path)
          : Promise.resolve(null),
        checkout.foto && checkout.foto.size > 0
          ? subirFotoCliente({
              bucket: "evidencias-checkin",
              path: `${asignacionId}/${maquinaId}-salida-${Date.now()}`,
              file: checkout.foto,
            }).then((r) => r.path)
          : Promise.resolve(null),
      ]);
      ejecutarLlenado(fotoUrl, fotoSalidaUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEtapa("foto_fallo");
    }
  }

  function finalizarSinFoto() {
    setError(null);
    ejecutarLlenado(null, null);
  }

  const enviando = etapa === "subiendo_foto" || etapa === "cerrando";

  // Qué renglones no caben, con lo capturado en este momento. Se recalcula en
  // cada render porque depende de lo que el operador va escribiendo.
  const desbordes: Record<
    string,
    { quedaria: number; capacidad: number } | null
  > = {};
  for (const it of items) {
    if (it.es_vaso) continue;
    const l = lineas[it.id];
    const t = it.tolvas_candidatas.find((c) => c.id === l?.tolva_id);
    desbordes[it.id] = noCabe(
      t,
      it.gramos_por_cartucho,
      l?.cartuchos_cargados ?? 0,
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Llenado</h2>

      <div className="space-y-3">
        {items.map((it) => {
          const l = lineas[it.id];
          const sinUsar = it.cartuchos_entregados - l.cartuchos_cargados;
          const label = it.es_vaso ? "Vasos" : "Cartuchos";
          return (
            <div
              key={it.id}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
            >
              <div className="font-medium text-zinc-900">
                {it.producto?.nombre}
              </div>
              <div className="font-mono text-xs text-zinc-500">
                {it.producto?.sku} · planeado {it.cartuchos_entregados}
                {it.es_vaso && " · vaso"}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {!it.es_vaso && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                      Tolva
                    </label>
                    <select
                      value={l.tolva_id}
                      onChange={(e) =>
                        setLinea(it.id, { tolva_id: e.target.value })
                      }
                      className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
                    >
                      {it.tolvas_candidatas.length === 0 && (
                        <option value="">— Sin tolva —</option>
                      )}
                      {it.tolvas_candidatas.map((t) => (
                        <option key={t.id} value={t.id}>
                          #{t.numero}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={it.es_vaso ? "col-span-2" : ""}>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {label}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={it.cartuchos_entregados}
                    step={1}
                    value={l.cartuchos_cargados}
                    onChange={(e) =>
                      setLinea(it.id, {
                        cartuchos_cargados: Math.max(
                          0,
                          Number(e.target.value) || 0,
                        ),
                      })
                    }
                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
                  />
                </div>
              </div>
              {sinUsar > 0 && (
                <p className="mt-1 text-[11px] text-amber-700">
                  {sinUsar} {it.es_vaso ? "vaso(s)" : "cartucho(s)"} sin usar
                  {it.es_vaso ? "" : " para devolución de almacén"}.
                </p>
              )}
              {/* En el renglón, no hasta el checkout: para cuando se cierra la
                  visita la bolsa ya se vació y el aviso llega tarde. */}
              {desbordes[it.id] && (
                <p className="mt-1 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-900">
                  ⚠️ No lo cargues: en esta tolva caben{" "}
                  {desbordes[it.id]!.capacidad} g y quedarían{" "}
                  {desbordes[it.id]!.quedaria} g, más del doble. Casi siempre es
                  un gramaje mal capturado en almacén. Pon 0 y levanta una
                  incidencia.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Foto del llenado (opcional)
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={async (e) => {
            const f = e.target.files?.[0] ?? null;
            if (!f) {
              setFoto(null);
              return;
            }
            try {
              setFoto(await compressImage(f));
            } catch {
              setFoto(f);
            }
          }}
          className="mt-1 block w-full text-sm text-zinc-700"
        />
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notas (opcional)
        </label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
        />
      </div>

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
              onClick={intentarSubirYFinalizar}
              className="flex-1 rounded-md border border-amber-700 bg-white px-3 py-2 text-sm font-medium text-amber-900 active:bg-amber-100"
            >
              Reintentar foto
            </button>
            <button
              type="button"
              onClick={finalizarSinFoto}
              className="flex-1 rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white active:bg-green-800"
            >
              Cerrar sin foto
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={intentarSubirYFinalizar}
          disabled={enviando}
          className="w-full rounded-md bg-green-700 px-4 py-3 text-base font-medium text-white shadow-sm active:bg-green-800 disabled:opacity-60"
        >
          {etapa === "subiendo_foto"
            ? "Subiendo foto..."
            : etapa === "cerrando"
              ? "Registrando..."
              : "Finalizar visita"}
        </button>
      )}

      {error && <p className="text-xs text-red-700">{error}</p>}

      <p className="text-[11px] text-zinc-500">
        Al finalizar se actualiza el inventario de cada tolva y el de vasos de
        la máquina. Lo que no uses —cartuchos o vasos— genera una devolución
        pendiente al almacén. Si la máquina no necesitaba nada, deja todo en
        cero y finaliza: se devuelve completo.
      </p>
    </div>
  );
}
