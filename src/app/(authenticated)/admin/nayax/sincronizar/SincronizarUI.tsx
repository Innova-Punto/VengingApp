"use client";

import { Check, Loader2, RefreshCw, Wifi } from "lucide-react";
import { useState, useTransition } from "react";

import {
  aplicarMapeo,
  autoCrearMaquinas,
  autoCrearProductos,
  diagnosticarProductosLynx,
  obtenerSnapshot,
  probarConexionLynx,
  vincularProductosExistentes,
  type Snapshot,
} from "./actions";

type ProductoConfig = {
  seleccionado: boolean;
  sku: string;
  nombre: string;
  tipo: "polvo" | "vaso";
  gramaje: string;
  precio: string;
};

export default function SincronizarUI() {
  const [estado, setEstado] = useState<
    "idle" | "probando" | "cargando" | "aplicando"
  >("idle");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mapeoMaquinas, setMapeoMaquinas] = useState<Record<string, string>>({});
  const [mapeoTolvas, setMapeoTolvas] = useState<Record<string, string>>({});
  // Para auto-creación: map { nayaxMachineId → ubicacion_id seleccionada }
  const [crearUbicacion, setCrearUbicacion] = useState<Record<string, string>>({});
  const [crearSeleccionadas, setCrearSeleccionadas] = useState<Record<string, boolean>>({});
  // Productos: state por key Nayax
  const [productos, setProductos] = useState<Record<string, ProductoConfig>>({});
  // Map opcional para vincular un producto Nayax a un producto local existente
  // (Mariana creó uno con nombre distinto, no se hizo automatch)
  const [vincularLocal, setVincularLocal] = useState<Record<string, string>>({});
  // Diagnóstico de productos por máquina Nayax (raw response)
  const [diagnostico, setDiagnostico] = useState<{
    machineId: number;
    raw: string;
    count: number;
  } | null>(null);
  const [, startTransition] = useTransition();

  async function handleDiagnosticar(nayaxMachineId: number) {
    setError(null);
    setMensaje(null);
    setDiagnostico(null);
    setEstado("cargando");
    startTransition(async () => {
      const r = await diagnosticarProductosLynx(nayaxMachineId);
      if (r.ok && r.data) {
        setDiagnostico({
          machineId: nayaxMachineId,
          raw: r.data.raw,
          count: r.data.productos.length,
        });
        setMensaje(r.message);
      } else {
        setError(r.ok ? "Sin datos" : r.message);
      }
      setEstado("idle");
    });
  }

  async function handleProbar() {
    setError(null);
    setMensaje(null);
    setEstado("probando");
    startTransition(async () => {
      const r = await probarConexionLynx();
      if (r.ok) setMensaje(r.message);
      else setError(r.message);
      setEstado("idle");
    });
  }

  async function handleCargar() {
    setError(null);
    setMensaje(null);
    setEstado("cargando");
    startTransition(async () => {
      const r = await obtenerSnapshot();
      if (r.ok && r.data) {
        setSnapshot(r.data);
        setMensaje(r.message);
        // Aplica sugerencias automáticas al estado de mapeo
        const m: Record<string, string> = {};
        for (const mn of r.data.maquinas_nayax) {
          if (mn.sugerencia_local_id) {
            m[mn.sugerencia_local_id] = String(mn.nayax.MachineID);
          }
        }
        setMapeoMaquinas(m);
        // Inicializa el state de productos
        const p: Record<string, ProductoConfig> = {};
        for (const pn of r.data.productos_nayax) {
          p[pn.key] = {
            seleccionado: !pn.local_id, // por default, los que no existen
            sku: pn.sku_sugerido,
            nombre: pn.dex_name,
            tipo: "polvo",
            gramaje: "25",
            precio:
              pn.precio_sugerido != null ? String(pn.precio_sugerido) : "",
          };
        }
        setProductos(p);
      } else {
        setError(r.ok ? "Sin datos" : r.message);
      }
      setEstado("idle");
    });
  }

  async function handleAutoCrearProductos() {
    if (!snapshot) return;
    setError(null);
    setMensaje(null);

    const items = Object.entries(productos)
      .filter(([key, v]) => v.seleccionado && !vincularLocal[key])
      .map(([key, v]) => {
        const pn = snapshot.productos_nayax.find((x) => x.key === key);
        return {
          sku: v.sku.trim(),
          nombre: v.nombre.trim(),
          tipo: v.tipo,
          gramaje_servicio_default:
            v.tipo === "polvo" && v.gramaje ? Number(v.gramaje) : null,
          precio_venta_default: v.precio ? Number(v.precio) : null,
          notas: "Importado desde Nayax (Lynx)",
          nayax_product_ids: pn?.nayax_product_ids ?? [],
        };
      });

    // Vínculos de productos Nayax a productos locales existentes
    const vinculos = Object.entries(vincularLocal)
      .filter(([, productoLocalId]) => !!productoLocalId)
      .map(([nayaxKey, productoLocalId]) => {
        const pn = snapshot.productos_nayax.find((x) => x.key === nayaxKey);
        if (!pn || pn.nayax_product_ids.length === 0) return null;
        return {
          productoLocalId,
          nayaxProductIds: pn.nayax_product_ids,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    if (items.length === 0 && vinculos.length === 0) {
      setError("Selecciona al menos un producto a crear o a vincular.");
      return;
    }

    setEstado("aplicando");
    startTransition(async () => {
      const mensajes: string[] = [];
      const errs: string[] = [];

      if (items.length > 0) {
        const r = await autoCrearProductos({ items });
        if (r.ok) {
          mensajes.push(r.message);
          if (r.data?.errores) errs.push(...r.data.errores);
        } else {
          errs.push(r.message);
        }
      }
      if (vinculos.length > 0) {
        const r = await vincularProductosExistentes({ vinculos });
        if (r.ok) {
          mensajes.push(r.message);
          if (r.data?.errores) errs.push(...r.data.errores);
        } else {
          errs.push(r.message);
        }
      }

      const r2 = await obtenerSnapshot();
      if (r2.ok && r2.data) setSnapshot(r2.data);

      if (mensajes.length > 0) setMensaje(mensajes.join(" · "));
      if (errs.length > 0) setError(errs.join(" · "));
      setEstado("idle");
      // Limpia vincular después de aplicar
      setVincularLocal({});
    });
  }

  async function handleAutoCrear() {
    if (!snapshot) return;
    setError(null);
    setMensaje(null);

    const items = Object.entries(crearSeleccionadas)
      .filter(([, v]) => v)
      .map(([nayaxId]) => {
        const m = snapshot.maquinas_nayax.find(
          (mn) => String(mn.nayax.MachineID) === nayaxId,
        );
        if (!m) return null;
        // Si no eligen ubicación, se queda en "Por asignar" (server lo resuelve)
        const ubicacionId = crearUbicacion[nayaxId] || null;
        return {
          nayaxMachineId: m.nayax.MachineID,
          machineNumber: m.nayax.MachineNumber ?? null,
          machineName: m.nayax.MachineName ?? null,
          serialNumber: m.nayax.SerialNumber ?? m.nayax.DeviceSerialNumber ?? null,
          ubicacionId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    if (items.length === 0) {
      setError("Selecciona al menos una máquina.");
      return;
    }

    setEstado("aplicando");
    startTransition(async () => {
      const r = await autoCrearMaquinas({ items });
      if (r.ok) {
        setMensaje(r.message);
        if (r.data?.errores && r.data.errores.length > 0) {
          setError(`Algunos errores: ${r.data.errores.join(" · ")}`);
        }
        // Refresca snapshot
        const r2 = await obtenerSnapshot();
        if (r2.ok && r2.data) setSnapshot(r2.data);
      } else {
        setError(r.message);
      }
      setEstado("idle");
    });
  }

  async function handleAplicar() {
    if (!snapshot) return;
    setError(null);
    setMensaje(null);
    setEstado("aplicando");

    const maquinas = Object.entries(mapeoMaquinas)
      .filter(([, v]) => !!v)
      .map(([localId, nayaxMachineId]) => ({ localId, nayaxMachineId }));

    const tolvas = Object.entries(mapeoTolvas)
      .filter(([, v]) => !!v)
      .map(([tolvaId, paCode]) => ({ tolvaId, paCode }));

    startTransition(async () => {
      const r = await aplicarMapeo({ maquinas, tolvas });
      if (r.ok) setMensaje(r.message);
      else setError(r.message);
      setEstado("idle");
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleProbar}
            disabled={estado !== "idle"}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {estado === "probando" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
            Probar conexión Lynx
          </button>
          <button
            type="button"
            onClick={handleCargar}
            disabled={estado !== "idle"}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {estado === "cargando" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Cargar máquinas de Nayax
          </button>
        </div>
        {mensaje && (
          <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
            {mensaje}
          </p>
        )}
        {error && (
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
      </section>

      {snapshot && (
        <>
          {/* Diagnóstico Lynx: ver productos en bruto por máquina */}
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold tracking-tight text-amber-900">
              Diagnóstico Lynx
            </h2>
            <p className="mt-1 text-xs text-amber-900">
              Si no ves productos en la sección morada, prueba aquí con una
              máquina específica. Si Lynx regresa <code>[]</code>, el
              planograma en Nayax está vacío. Si regresa productos, hay un
              bug y avisas.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {snapshot.maquinas_nayax.slice(0, 8).map((mn) => (
                <button
                  key={mn.nayax.MachineID}
                  type="button"
                  onClick={() => handleDiagnosticar(mn.nayax.MachineID)}
                  disabled={estado !== "idle"}
                  className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-mono text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                >
                  #{mn.nayax.MachineID}
                  {mn.nayax.MachineNumber ? ` · ${mn.nayax.MachineNumber}` : ""}
                </button>
              ))}
            </div>
            {diagnostico && (
              <div className="mt-3">
                <div className="text-xs font-medium text-amber-900">
                  Respuesta cruda de Lynx /v1/machine/{diagnostico.machineId}/machineProducts
                  ({diagnostico.count} productos):
                </div>
                <pre className="mt-1 max-h-80 overflow-auto rounded-md border border-amber-200 bg-white p-2 text-[10px] font-mono text-zinc-700">
                  {diagnostico.raw}
                </pre>
              </div>
            )}
          </section>

          {/* Productos Nayax: auto-creación */}
          {snapshot.productos_nayax.length > 0 && (
            <section className="space-y-3 rounded-lg border border-purple-200 bg-purple-50 p-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-purple-900">
                  Productos en Nayax ({snapshot.productos_nayax.length} únicos)
                </h2>
                <p className="text-xs text-purple-900">
                  Productos detectados en las máquinas Nayax,{" "}
                  <strong>agrupados por nombre</strong> (Nayax asigna un{" "}
                  <code>NayaxProductID</code> distinto por planograma para el
                  mismo producto físico). Cada producto local puede tener{" "}
                  <strong>hasta 4 NayaxIDs</strong> vinculados. Selecciona los
                  nuevos a crear, o vincúlalos a uno local ya existente.{" "}
                  <strong>Crea estos productos primero</strong> para poder
                  asignarlos a las tolvas después.
                </p>
              </div>
              <div className="overflow-hidden rounded-md border border-purple-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-purple-100 bg-purple-50/50 text-left text-xs uppercase tracking-wide text-purple-900">
                    <tr>
                      <th className="w-10 px-2 py-2"></th>
                      <th className="px-2 py-2 font-medium">Nombre Nayax</th>
                      <th className="px-2 py-2 font-medium">SKU local</th>
                      <th className="px-2 py-2 font-medium">Tipo</th>
                      <th className="px-2 py-2 font-medium">Gramaje (g)</th>
                      <th className="px-2 py-2 font-medium">Precio</th>
                      <th className="px-2 py-2 font-medium">
                        o vincular a local
                      </th>
                      <th className="px-2 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-50">
                    {snapshot.productos_nayax.map((pn) => {
                      const cfg = productos[pn.key];
                      if (!cfg) return null;
                      const yaExiste = !!pn.local_id;
                      const vinculadoA = vincularLocal[pn.key] ?? "";
                      return (
                        <tr key={pn.key} className={yaExiste ? "bg-zinc-50" : ""}>
                          <td className="px-2 py-2">
                            {!yaExiste && (
                              <input
                                type="checkbox"
                                checked={cfg.seleccionado && !vinculadoA}
                                disabled={!!vinculadoA}
                                onChange={(e) =>
                                  setProductos((prev) => ({
                                    ...prev,
                                    [pn.key]: {
                                      ...prev[pn.key],
                                      seleccionado: e.target.checked,
                                    },
                                  }))
                                }
                                className="h-4 w-4"
                              />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-medium text-zinc-900">
                              {pn.dex_name}
                            </div>
                            {pn.nayax_product_ids.length > 0 && (
                              <div className="font-mono text-[10px] text-zinc-500">
                                NayaxIDs:{" "}
                                {pn.nayax_product_ids.join(", ")}
                                {pn.nayax_product_ids.length > 1 && (
                                  <span className="ml-1 text-zinc-400">
                                    ({pn.nayax_product_ids.length} planogramas)
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {yaExiste ? (
                              <span className="font-mono text-xs text-zinc-700">
                                {pn.local_sku}
                              </span>
                            ) : (
                              <input
                                type="text"
                                value={cfg.sku}
                                onChange={(e) =>
                                  setProductos((prev) => ({
                                    ...prev,
                                    [pn.key]: {
                                      ...prev[pn.key],
                                      sku: e.target.value,
                                    },
                                  }))
                                }
                                disabled={!cfg.seleccionado}
                                className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-xs font-mono"
                              />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {!yaExiste && (
                              <select
                                value={cfg.tipo}
                                onChange={(e) =>
                                  setProductos((prev) => ({
                                    ...prev,
                                    [pn.key]: {
                                      ...prev[pn.key],
                                      tipo: e.target.value as
                                        | "polvo"
                                        | "vaso",
                                    },
                                  }))
                                }
                                disabled={!cfg.seleccionado}
                                className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                              >
                                <option value="polvo">polvo</option>
                                <option value="vaso">vaso</option>
                              </select>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {!yaExiste && cfg.tipo === "polvo" && (
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={cfg.gramaje}
                                onChange={(e) =>
                                  setProductos((prev) => ({
                                    ...prev,
                                    [pn.key]: {
                                      ...prev[pn.key],
                                      gramaje: e.target.value,
                                    },
                                  }))
                                }
                                disabled={!cfg.seleccionado}
                                className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-right text-xs"
                              />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {!yaExiste && (
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={cfg.precio}
                                onChange={(e) =>
                                  setProductos((prev) => ({
                                    ...prev,
                                    [pn.key]: {
                                      ...prev[pn.key],
                                      precio: e.target.value,
                                    },
                                  }))
                                }
                                disabled={!cfg.seleccionado}
                                placeholder="0.00"
                                className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right text-xs"
                              />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {!yaExiste && pn.nayax_product_ids.length > 0 && (
                              <select
                                value={vinculadoA}
                                onChange={(e) =>
                                  setVincularLocal((prev) => ({
                                    ...prev,
                                    [pn.key]: e.target.value,
                                  }))
                                }
                                className="w-44 rounded-md border border-zinc-300 px-2 py-1 text-xs"
                              >
                                <option value="">— crear nuevo —</option>
                                {snapshot.productos_locales
                                  .filter(
                                    (pl) =>
                                      pl.nayax_product_ids.length + pn.nayax_product_ids.length <= 4,
                                  )
                                  .map((pl) => (
                                    <option key={pl.id} value={pl.id}>
                                      {pl.sku} · {pl.nombre}
                                      {pl.nayax_product_ids.length > 0
                                        ? ` (${pl.nayax_product_ids.length}/4)`
                                        : ""}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {yaExiste ? (
                              <span className="inline-flex items-center gap-1 text-green-700">
                                <Check className="h-3 w-3" />
                                vinculado ({pn.ya_vinculados}/
                                {pn.nayax_product_ids.length})
                              </span>
                            ) : vinculadoA ? (
                              <span className="text-blue-700">vincular</span>
                            ) : (
                              <span className="text-zinc-500">nuevo</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={handleAutoCrearProductos}
                disabled={estado !== "idle"}
                className="inline-flex items-center gap-2 rounded-md bg-purple-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-800 disabled:opacity-60"
              >
                Crear/vincular productos seleccionados
              </button>
            </section>
          )}

          {/* Máquinas Nayax sin match local: oferta de auto-creación */}
          {(() => {
            const sinMatch = snapshot.maquinas_nayax.filter(
              (mn) => !mn.sugerencia_local_id,
            );
            if (sinMatch.length === 0) return null;
            return (
              <section className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-blue-900">
                    Máquinas en Nayax sin contraparte local ({sinMatch.length})
                  </h2>
                  <p className="text-xs text-blue-900">
                    Marca las que quieres crear localmente. Se crearán en
                    estado <strong>mantenimiento</strong> con tolvas vacías
                    (8 tolvas, capacidad 1500g, frecuencia 3 días, vaso 200).
                    La ubicación es <strong>opcional</strong>: si la dejas
                    en &quot;Por asignar&quot;, Mariana podrá moverla a la
                    correcta después desde <code>/admin/maquinas</code>.
                  </p>
                </div>
                <div className="overflow-hidden rounded-md border border-blue-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="border-b border-blue-100 bg-blue-50/50 text-left text-xs uppercase tracking-wide text-blue-900">
                      <tr>
                        <th className="w-10 px-3 py-2"></th>
                        <th className="px-3 py-2 font-medium">Máquina Nayax</th>
                        <th className="px-3 py-2 font-medium">Ubicación local</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-50">
                      {sinMatch.map((mn) => {
                        const id = String(mn.nayax.MachineID);
                        return (
                          <tr key={id}>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={!!crearSeleccionadas[id]}
                                onChange={(e) =>
                                  setCrearSeleccionadas((prev) => ({
                                    ...prev,
                                    [id]: e.target.checked,
                                  }))
                                }
                                className="h-4 w-4"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-mono text-xs font-medium">
                                #{mn.nayax.MachineID}
                                {mn.nayax.MachineNumber
                                  ? ` · ${mn.nayax.MachineNumber}`
                                  : ""}
                              </div>
                              {mn.nayax.MachineName && (
                                <div className="text-xs text-zinc-600">
                                  {mn.nayax.MachineName}
                                </div>
                              )}
                              {mn.productos.length > 0 && (
                                <div className="mt-0.5 text-[10px] text-zinc-500">
                                  {mn.productos.length} productos configurados
                                  en Nayax
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={crearUbicacion[id] ?? ""}
                                onChange={(e) =>
                                  setCrearUbicacion((prev) => ({
                                    ...prev,
                                    [id]: e.target.value,
                                  }))
                                }
                                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs shadow-sm"
                              >
                                <option value="">⏳ Por asignar (Mariana después)</option>
                                {snapshot.ubicaciones
                                  .filter(
                                    (u) =>
                                      !u.nombre
                                        .toLowerCase()
                                        .includes("por asignar"),
                                  )
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.cliente_nombre} · {u.nombre}
                                    </option>
                                  ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={handleAutoCrear}
                  disabled={estado !== "idle"}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  Crear máquinas seleccionadas
                </button>
              </section>
            );
          })()}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">
              1. Mapear máquinas
            </h2>
            <p className="text-xs text-zinc-500">
              Por cada máquina local, elige a qué máquina de Nayax corresponde.
              Las que detectamos automáticamente vienen pre-seleccionadas.
            </p>
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Máquina local</th>
                    <th className="px-3 py-2 font-medium">Máquina Nayax</th>
                    <th className="px-3 py-2 font-medium">Detección</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {snapshot.maquinas_locales.map((local) => {
                    const seleccionada = mapeoMaquinas[local.id] ?? "";
                    const sugerencia = snapshot.maquinas_nayax.find(
                      (mn) => mn.sugerencia_local_id === local.id,
                    );
                    return (
                      <tr key={local.id}>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs font-medium">
                            {local.serie}
                          </div>
                          {local.alias && (
                            <div className="text-xs text-zinc-500">
                              {local.alias}
                            </div>
                          )}
                          {local.nayax_machine_id && (
                            <div className="mt-0.5 text-[10px] text-zinc-400">
                              actual: {local.nayax_machine_id}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={seleccionada}
                            onChange={(e) =>
                              setMapeoMaquinas((prev) => ({
                                ...prev,
                                [local.id]: e.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs shadow-sm"
                          >
                            <option value="">— No mapear —</option>
                            {snapshot.maquinas_nayax.map((mn) => (
                              <option
                                key={mn.nayax.MachineID}
                                value={String(mn.nayax.MachineID)}
                              >
                                #{mn.nayax.MachineID} ·{" "}
                                {mn.nayax.MachineNumber ??
                                  mn.nayax.MachineName ??
                                  "(sin nombre)"}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {sugerencia?.sugerencia_razon ? (
                            <span className="inline-flex items-center gap-1 text-green-700">
                              <Check className="h-3 w-3" />
                              {sugerencia.sugerencia_razon}
                            </span>
                          ) : (
                            <span className="text-zinc-400">manual</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">
              2. Mapear tolvas por máquina
            </h2>
            <p className="text-xs text-zinc-500">
              Para cada máquina mapeada, asigna a cada tolva su Product PA Code
              de Nayax (ej. A1, B2). Lo necesitamos para que las ventas se
              descuenten de la tolva correcta.
            </p>
            {snapshot.maquinas_locales.map((local) => {
              const nayaxId = mapeoMaquinas[local.id];
              if (!nayaxId) return null;
              const mn = snapshot.maquinas_nayax.find(
                (x) => String(x.nayax.MachineID) === nayaxId,
              );
              if (!mn || mn.productos.length === 0) {
                return (
                  <div
                    key={local.id}
                    className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
                  >
                    <strong>{local.serie}</strong> mapeada a #{nayaxId} pero
                    Nayax no tiene productos configurados (o no los retornó).
                  </div>
                );
              }
              const paCodes = mn.productos
                .map((p) => p.PACode)
                .filter((c): c is string => !!c);
              return (
                <div
                  key={local.id}
                  className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
                >
                  <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2">
                    <div className="font-mono text-xs font-medium">
                      {local.serie}
                    </div>
                    {local.alias && (
                      <div className="text-xs text-zinc-500">{local.alias}</div>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Tolva</th>
                        <th className="px-3 py-1.5 font-medium">
                          PA Code (Nayax)
                        </th>
                        <th className="px-3 py-1.5 font-medium">Producto Nayax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {local.tolvas
                        .slice()
                        .sort((a, b) => a.numero - b.numero)
                        .map((t) => {
                          const initialValue =
                            mapeoTolvas[t.id] ?? t.nayax_item_code ?? "";
                          const prodSelected = mn.productos.find(
                            (p) => p.PACode === initialValue,
                          );
                          return (
                            <tr key={t.id}>
                              <td className="px-3 py-1 font-mono text-xs">
                                #{t.numero}
                                {t.nayax_item_code && (
                                  <span className="ml-1 text-[10px] text-zinc-400">
                                    actual: {t.nayax_item_code}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1">
                                <select
                                  value={initialValue}
                                  onChange={(e) =>
                                    setMapeoTolvas((prev) => ({
                                      ...prev,
                                      [t.id]: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs shadow-sm"
                                >
                                  <option value="">— No mapear —</option>
                                  {paCodes.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-1 text-xs text-zinc-600">
                                {prodSelected?.DEXProductName ?? "—"}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>

          <section className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="mb-3 text-sm text-green-900">
              Al aplicar, se guardará el <code>nayax_machine_id</code> en cada
              máquina seleccionada y el <code>nayax_item_code</code> en cada
              tolva seleccionada. Las que dejes en &laquo;No mapear&raquo; no
              se tocan.
            </p>
            <button
              type="button"
              onClick={handleAplicar}
              disabled={estado !== "idle"}
              className="inline-flex items-center gap-2 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60"
            >
              {estado === "aplicando" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Aplicar mapeo
            </button>
          </section>
        </>
      )}
    </div>
  );
}
