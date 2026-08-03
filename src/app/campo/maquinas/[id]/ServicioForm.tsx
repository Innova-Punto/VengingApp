"use client";

import { useMemo, useState, useTransition } from "react";

import { compressImage } from "@/lib/image-compress";
import { subirFotoCliente } from "@/lib/storage-upload";

import SignaturePad from "./SignaturePad";
import { registrarServicio } from "./actions";

export type ChecklistItemUI = {
  id: string;
  seccion: string;
  orden: number;
  nombre: string;
  obligatorio: boolean;
};

type Estado = "bien" | "mal" | "na";

type Respuesta = {
  estado: Estado | null;
  descripcion: string;
  foto: File | null;
};

type Etapa = "idle" | "subiendo" | "guardando" | "error";

export default function ServicioForm({
  checkInId,
  asignacionId,
  maquinaId,
  plantillaId,
  plantillaNombre,
  items,
}: {
  checkInId: string;
  asignacionId: string;
  maquinaId: string;
  plantillaId: string;
  plantillaNombre: string;
  items: ChecklistItemUI[];
}) {
  const secciones = useMemo(() => {
    const map = new Map<string, ChecklistItemUI[]>();
    for (const it of items) {
      const arr = map.get(it.seccion) ?? [];
      arr.push(it);
      map.set(it.seccion, arr);
    }
    const entries = Array.from(map.entries());
    for (const [, arr] of entries) {
      arr.sort((a, b) => a.orden - b.orden);
    }
    return entries;
  }, [items]);

  const [respuestas, setRespuestas] = useState<Record<string, Respuesta>>({});
  const [inventarioSf, setInventarioSf] = useState("");
  const [productoRepuesto, setProductoRepuesto] = useState<boolean | null>(null);
  const [cantidadRepuesta, setCantidadRepuesta] = useState("");
  const [fotoGeneral, setFotoGeneral] = useState<File | null>(null);
  const [liderNombre, setLiderNombre] = useState("");
  const [firma, setFirma] = useState<Blob | null>(null);
  const [sinFirma, setSinFirma] = useState(false);
  const [firmaMotivo, setFirmaMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("idle");
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function setResp(itemId: string, patch: Partial<Respuesta>) {
    setRespuestas((prev) => {
      const base: Respuesta =
        prev[itemId] ?? { estado: null, descripcion: "", foto: null };
      return { ...prev, [itemId]: { ...base, ...patch } };
    });
  }

  const respondidos = items.filter((it) => respuestas[it.id]?.estado).length;

  function validar(): string | null {
    for (const it of items) {
      const r = respuestas[it.id];
      if (it.obligatorio && !r?.estado) {
        return `Falta responder: ${it.seccion} · ${it.nombre}`;
      }
      if (r?.estado === "mal" && !r.descripcion.trim()) {
        return `Describe qué está mal en: ${it.seccion} · ${it.nombre}`;
      }
    }
    if (productoRepuesto === null) {
      return "Indica si repusiste producto (sí/no).";
    }
    if (productoRepuesto && !cantidadRepuesta.trim()) {
      return "Indica cuánto producto repusiste.";
    }
    if (!sinFirma) {
      if (!liderNombre.trim()) return "Escribe el nombre del líder que recibe.";
      if (!firma) return "Captura la firma del líder (o marca que no está disponible).";
    } else if (!firmaMotivo.trim()) {
      return "Explica por qué no fue posible obtener la firma.";
    }
    return null;
  }

  async function enviar() {
    setError(null);
    const err = validar();
    if (err) {
      setError(err);
      setEtapa("error");
      return;
    }

    setEtapa("subiendo");
    try {
      const base = `${asignacionId}/${maquinaId}-${Date.now()}`;

      // Fotos de items marcados MAL (opcionales pero recomendadas)
      const respuestasPayload: {
        item_id: string;
        estado: Estado;
        descripcion: string | null;
        foto_url: string | null;
      }[] = [];
      let n = 0;
      for (const it of items) {
        const r = respuestas[it.id];
        if (!r?.estado) continue;
        let foto_url: string | null = null;
        if (r.foto && r.foto.size > 0) {
          n += 1;
          setProgreso(`Subiendo foto ${n}…`);
          const up = await subirFotoCliente({
            bucket: "evidencias-servicio",
            path: `${base}-item${n}`,
            file: r.foto,
          });
          foto_url = up.path;
        }
        respuestasPayload.push({
          item_id: it.id,
          estado: r.estado,
          descripcion: r.descripcion.trim() || null,
          foto_url,
        });
      }

      let fotoGeneralPath: string | null = null;
      if (fotoGeneral && fotoGeneral.size > 0) {
        setProgreso("Subiendo foto general…");
        const up = await subirFotoCliente({
          bucket: "evidencias-servicio",
          path: `${base}-general`,
          file: fotoGeneral,
        });
        fotoGeneralPath = up.path;
      }

      let firmaPath: string | null = null;
      if (!sinFirma && firma) {
        setProgreso("Subiendo firma…");
        const firmaFile = new File([firma], "firma.png", { type: "image/png" });
        const up = await subirFotoCliente({
          bucket: "evidencias-servicio",
          path: `${base}-firma`,
          file: firmaFile,
        });
        firmaPath = up.path;
      }

      setEtapa("guardando");
      setProgreso("");
      startTransition(async () => {
        const r = await registrarServicio({
          checkInId,
          asignacionId,
          maquinaId,
          plantillaId,
          respuestas: respuestasPayload,
          inventarioSf: inventarioSf.trim() || null,
          productoRepuesto: productoRepuesto === true,
          cantidadRepuesta:
            productoRepuesto && cantidadRepuesta.trim()
              ? Number(cantidadRepuesta) || null
              : null,
          fotoGeneralPath,
          liderNombre: sinFirma ? null : liderNombre.trim(),
          firmaPath,
          firmaNoDisponible: sinFirma,
          firmaMotivo: sinFirma ? firmaMotivo.trim() : null,
          observaciones: observaciones.trim() || null,
        });
        if (!r.ok) {
          setError(r.message);
          setEtapa("error");
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEtapa("error");
    }
  }

  const enviando = etapa === "subiendo" || etapa === "guardando";

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">
          Checklist de servicio
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          {plantillaNombre} · {respondidos}/{items.length} puntos
        </p>
      </div>

      {secciones.map(([seccion, its]) => (
        <div key={seccion} className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {seccion}
          </div>
          {its.map((it) => {
            const r = respuestas[it.id];
            return (
              <div
                key={it.id}
                className="rounded-md border border-zinc-200 p-2"
              >
                <div className="text-sm text-zinc-800">{it.nombre}</div>
                <div className="mt-1.5 flex gap-1.5">
                  {(
                    [
                      ["bien", "Bien", "border-green-700 bg-green-100 text-green-900"],
                      ["mal", "Mal", "border-red-700 bg-red-100 text-red-900"],
                      ["na", "N/A", "border-zinc-500 bg-zinc-100 text-zinc-700"],
                    ] as const
                  ).map(([val, label, activo]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setResp(it.id, { estado: val })}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${
                        r?.estado === val
                          ? activo
                          : "border-zinc-300 bg-white text-zinc-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {r?.estado === "mal" && (
                  <div className="mt-2 space-y-1.5">
                    <textarea
                      value={r.descripcion}
                      onChange={(e) =>
                        setResp(it.id, { descripcion: e.target.value })
                      }
                      rows={2}
                      placeholder="¿Qué está mal? (obligatorio)"
                      className="w-full rounded-md border border-red-300 px-2 py-1 text-sm focus:border-red-500 focus:outline-none"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={async (e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (!f) {
                          setResp(it.id, { foto: null });
                          return;
                        }
                        try {
                          setResp(it.id, { foto: await compressImage(f) });
                        } catch {
                          setResp(it.id, { foto: f });
                        }
                      }}
                      className="block w-full text-xs text-zinc-700"
                    />
                    {r.foto && (
                      <p className="text-[11px] text-green-700">
                        ✓ Foto: {r.foto.name}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="space-y-3 rounded-lg border border-zinc-300 bg-zinc-50 p-3">
        <div className="text-sm font-semibold text-zinc-900">Producto</div>
        <div>
          <label className="text-xs font-medium text-zinc-800">
            Inventario S/F visible{" "}
            <span className="text-zinc-400">(opcional)</span>
          </label>
          <input
            type="text"
            value={inventarioSf}
            onChange={(e) => setInventarioSf(e.target.value)}
            placeholder="Ej. 12 cajas en bodega del cliente"
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-800">
            ¿Repusiste producto?
          </div>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setProductoRepuesto(true)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                productoRepuesto === true
                  ? "border-green-700 bg-green-100 text-green-900"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => setProductoRepuesto(false)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                productoRepuesto === false
                  ? "border-red-700 bg-red-100 text-red-900"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              No
            </button>
          </div>
        </div>
        {productoRepuesto && (
          <div>
            <label className="text-xs font-medium text-zinc-800">
              ¿Cuántas piezas repusiste?
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={cantidadRepuesta}
              onChange={(e) => setCantidadRepuesta(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-zinc-800">
          Foto general de la máquina{" "}
          <span className="text-zinc-400">(opcional)</span>
        </label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={async (e) => {
            const f = e.target.files?.[0] ?? null;
            if (!f) {
              setFotoGeneral(null);
              return;
            }
            try {
              setFotoGeneral(await compressImage(f));
            } catch {
              setFotoGeneral(f);
            }
          }}
          className="mt-1 block w-full text-sm text-zinc-700"
        />
        {fotoGeneral && (
          <p className="mt-1 text-[11px] text-green-700">
            ✓ Foto seleccionada: {fotoGeneral.name}
          </p>
        )}
      </div>

      <textarea
        value={observaciones}
        onChange={(e) => setObservaciones(e.target.value)}
        rows={2}
        placeholder="Observaciones generales (opcional)"
        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm shadow-sm focus:border-zinc-900 focus:outline-none"
      />

      <div className="space-y-3 rounded-lg border border-zinc-300 bg-zinc-50 p-3">
        <div className="text-sm font-semibold text-zinc-900">
          Recibe el líder del sitio
        </div>
        {!sinFirma && (
          <>
            <div>
              <label className="text-xs font-medium text-zinc-800">
                Nombre del líder
              </label>
              <input
                type="text"
                value={liderNombre}
                onChange={(e) => setLiderNombre(e.target.value)}
                placeholder="Nombre y apellido"
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <SignaturePad onChange={setFirma} />
          </>
        )}
        <label className="flex items-center gap-2 text-xs text-zinc-700">
          <input
            type="checkbox"
            checked={sinFirma}
            onChange={(e) => setSinFirma(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          El líder no está disponible para firmar
        </label>
        {sinFirma && (
          <textarea
            value={firmaMotivo}
            onChange={(e) => setFirmaMotivo(e.target.value)}
            rows={2}
            placeholder="¿Por qué no fue posible obtener la firma? (obligatorio)"
            className="w-full rounded-md border border-amber-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none"
          />
        )}
      </div>

      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm active:bg-zinc-800 disabled:opacity-60"
      >
        {etapa === "subiendo"
          ? progreso || "Subiendo evidencias…"
          : etapa === "guardando"
            ? "Guardando servicio…"
            : "Finalizar servicio"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
