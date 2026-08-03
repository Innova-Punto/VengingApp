/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Detalle de servicio · Innovaypunto" };

async function signedUrl(
  supabase: ReturnType<typeof createClient>,
  storedPath: string | null,
): Promise<string | null> {
  if (!storedPath) return null;
  const [bucket, ...rest] = storedPath.split("/");
  const path = rest.join("/");
  if (!bucket || !path) return null;
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export default async function ServicioDetallePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion", "planeador");
  const supabase = createClient();

  const { data: v } = await supabase
    .from("servicio_visitas")
    .select(
      `id, folio, fecha, inventario_sf, producto_repuesto, cantidad_repuesta,
       foto_general_url, lider_nombre, firma_url, firma_no_disponible,
       firma_motivo, observaciones,
       maquina:maquinas(id, serie, alias,
         ubicacion:ubicaciones(nombre, cliente:clientes(nombre))),
       operador:profiles!servicio_visitas_operador_id_fkey(full_name),
       plantilla:checklist_plantillas(nombre, version),
       check_in:check_ins(fecha_entrada, fecha_salida, tiempo_en_sitio_seg),
       respuestas:servicio_respuestas(
         id, estado, descripcion, foto_url,
         item:checklist_items(seccion, orden, nombre)
       )`,
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!v) notFound();

  const maq = Array.isArray(v.maquina) ? v.maquina[0] : v.maquina;
  const ubic = maq
    ? Array.isArray(maq.ubicacion)
      ? maq.ubicacion[0]
      : maq.ubicacion
    : null;
  const cliente = ubic
    ? Array.isArray(ubic.cliente)
      ? ubic.cliente[0]
      : ubic.cliente
    : null;
  const op = Array.isArray(v.operador) ? v.operador[0] : v.operador;
  const plantilla = Array.isArray(v.plantilla) ? v.plantilla[0] : v.plantilla;
  const checkIn = Array.isArray(v.check_in) ? v.check_in[0] : v.check_in;

  type RespuestaRow = {
    id: string;
    estado: string | null;
    descripcion: string | null;
    foto_url: string | null;
    item:
      | { seccion: string; orden: number; nombre: string }
      | { seccion: string; orden: number; nombre: string }[]
      | null;
  };
  const respuestas = ((v.respuestas ?? []) as RespuestaRow[])
    .map((r) => ({
      ...r,
      itemInfo: Array.isArray(r.item) ? r.item[0] : r.item,
    }))
    .sort((a, b) => (a.itemInfo?.orden ?? 0) - (b.itemInfo?.orden ?? 0));

  const fallas = respuestas.filter((r) => r.estado === "mal");

  // Signed URLs de evidencias
  const [fotoGeneralSrc, firmaSrc, ...fotosFallas] = await Promise.all([
    signedUrl(supabase, v.foto_general_url),
    signedUrl(supabase, v.firma_url),
    ...fallas.map((r) => signedUrl(supabase, r.foto_url)),
  ]);
  const fotoFallaPorId = new Map<string, string | null>();
  fallas.forEach((r, i) => fotoFallaPorId.set(r.id, fotosFallas[i] ?? null));

  // Agrupa por sección preservando el orden global
  const secciones: { nombre: string; items: typeof respuestas }[] = [];
  for (const r of respuestas) {
    const secNombre = r.itemInfo?.seccion ?? "—";
    const ultima = secciones[secciones.length - 1];
    if (ultima && ultima.nombre === secNombre) {
      ultima.items.push(r);
    } else {
      secciones.push({ nombre: secNombre, items: [r] });
    }
  }

  const tiempoMin = checkIn?.tiempo_en_sitio_seg
    ? Math.round(checkIn.tiempo_en_sitio_seg / 60)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/servicios"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Servicios
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {v.folio}
          </h1>
          {fallas.length === 0 ? (
            <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              ✓ sin fallas
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {fallas.length} falla{fallas.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          {fmtCDMX(v.fecha, {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {tiempoMin !== null && ` · ${tiempoMin} min en sitio`}
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Máquina
          </div>
          <div className="mt-1 font-mono text-sm">{maq?.serie ?? "—"}</div>
          <div className="text-sm text-zinc-700">{maq?.alias ?? ""}</div>
          <div className="text-xs text-zinc-500">
            {cliente?.nombre ?? ""}
            {cliente && ubic ? " · " : ""}
            {ubic?.nombre ?? ""}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Operador
          </div>
          <div className="mt-1 text-sm text-zinc-900">
            {op?.full_name ?? "—"}
          </div>
          <div className="text-xs text-zinc-500">
            {plantilla ? `${plantilla.nombre} v${plantilla.version}` : ""}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Producto
          </div>
          <div className="mt-1 text-sm text-zinc-900">
            {v.producto_repuesto
              ? `Repuso ${v.cantidad_repuesta ?? "—"} pzas`
              : "Sin reposición"}
          </div>
          {v.inventario_sf && (
            <div className="text-xs text-zinc-500">
              Inventario S/F: {v.inventario_sf}
            </div>
          )}
        </div>
      </section>

      {fallas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Fallas detectadas
          </h2>
          {fallas.map((r) => {
            const foto = fotoFallaPorId.get(r.id);
            return (
              <div
                key={r.id}
                className="rounded-lg border border-red-200 bg-red-50 p-3"
              >
                <div className="text-sm font-medium text-red-900">
                  {r.itemInfo?.seccion} · {r.itemInfo?.nombre}
                </div>
                {r.descripcion && (
                  <p className="mt-1 text-sm text-red-800">{r.descripcion}</p>
                )}
                {foto && (
                  <a href={foto} target="_blank" rel="noreferrer">
                    <img
                      src={foto}
                      alt={`Evidencia: ${r.itemInfo?.nombre}`}
                      className="mt-2 max-h-48 rounded-md border border-red-200"
                    />
                  </a>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
          Checklist completo · {respuestas.length} puntos
        </div>
        {secciones.map((sec) => (
          <div key={sec.nombre}>
            <div className="border-b border-zinc-100 bg-zinc-50/50 px-3 py-1.5 text-xs font-semibold text-zinc-600">
              {sec.nombre}
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {sec.items.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-1.5 text-zinc-800">
                      {r.itemInfo?.nombre}
                    </td>
                    <td className="w-20 px-3 py-1.5 text-right">
                      {r.estado === "bien" && (
                        <span className="text-xs font-medium text-green-700">
                          Bien
                        </span>
                      )}
                      {r.estado === "mal" && (
                        <span className="text-xs font-medium text-red-700">
                          Mal
                        </span>
                      )}
                      {r.estado === "na" && (
                        <span className="text-xs text-zinc-400">N/A</span>
                      )}
                      {!r.estado && (
                        <span className="text-xs text-zinc-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      {v.observaciones && (
        <section className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Observaciones
          </div>
          <p className="mt-1 text-sm text-zinc-800">{v.observaciones}</p>
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        {fotoGeneralSrc && (
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Foto general
            </div>
            <a href={fotoGeneralSrc} target="_blank" rel="noreferrer">
              <img
                src={fotoGeneralSrc}
                alt="Foto general de la máquina"
                className="mt-2 max-h-64 rounded-md border border-zinc-200"
              />
            </a>
          </div>
        )}
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Recibe el líder del sitio
          </div>
          {v.firma_no_disponible ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Sin firma: {v.firma_motivo}
            </div>
          ) : (
            <>
              <div className="mt-1 text-sm text-zinc-900">
                {v.lider_nombre}
              </div>
              {firmaSrc && (
                <img
                  src={firmaSrc}
                  alt={`Firma de ${v.lider_nombre}`}
                  className="mt-2 max-h-36 rounded-md border border-zinc-200 bg-white"
                />
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
