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
};

type Item = {
  id: string;
  producto_id: string;
  cartuchos_entregados: number;
  encartuchado_id: string | null;
  producto: { sku: string; nombre: string; tipo: string } | null;
  tolvas_candidatas: TolvaCandidata[];
  es_vaso: boolean;
};

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

    setEtapa("cerrando");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("check_in_id", checkInId);
      fd.set("asignacion_id", asignacionId);
      fd.set("maquina_id", maquinaId);
      fd.set("items", JSON.stringify(payloadCartuchos));
      fd.set("vasos_cargados", String(vasosCargados));
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
        Al finalizar, se descuenta inventario de cartuchos y se actualiza el
        inventario de cada tolva. Los cartuchos no usados generan una
        devolución pendiente al almacén.
      </p>
    </div>
  );
}
