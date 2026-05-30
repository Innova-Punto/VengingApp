import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import IncidenciaForm from "./IncidenciaForm";

export const metadata = { title: "Detalle incidencia · MuscleUp" };

const ESTADO_BADGE: Record<string, string> = {
  abierta: "bg-red-100 text-red-700",
  en_revision: "bg-amber-100 text-amber-700",
  resuelta: "bg-green-100 text-green-700",
  descartada: "bg-zinc-200 text-zinc-600",
};

const SEVERIDAD_BADGE: Record<string, string> = {
  baja: "bg-zinc-100 text-zinc-600",
  media: "bg-amber-100 text-amber-700",
  alta: "bg-red-100 text-red-700",
};

export default async function IncidenciaDetallePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const { data: i, error } = await supabase
    .from("incidencias")
    .select(
      `id, folio, tipo, severidad, estado, descripcion, foto_url,
       fecha_apertura, fecha_cierre, fecha_autorizacion,
       requiere_autorizacion_merma, cartuchos_afectados,
       notas_resolucion,
       maquina:maquinas(serie, alias, ubicacion:ubicaciones(nombre, cliente:clientes(nombre))),
       operador:profiles!incidencias_operador_id_fkey(full_name),
       autorizada:profiles!incidencias_autorizada_por_fkey(full_name),
       check_in:check_ins(fecha_entrada),
       producto_afectado:productos!incidencias_producto_afectado_id_fkey(sku, nombre),
       encartuchado_afectado:encartuchados!incidencias_encartuchado_afectado_id_fkey(id, lote_id)`,
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!i) notFound();

  const maq = Array.isArray(i.maquina) ? i.maquina[0] : i.maquina;
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
  const op = Array.isArray(i.operador) ? i.operador[0] : i.operador;
  const aut = Array.isArray(i.autorizada) ? i.autorizada[0] : i.autorizada;
  const prod = Array.isArray(i.producto_afectado)
    ? i.producto_afectado[0]
    : i.producto_afectado;

  // Foto: signed URL si está
  let fotoSrc: string | null = null;
  if (i.foto_url) {
    const [bucket, ...rest] = i.foto_url.split("/");
    const path = rest.join("/");
    if (bucket && path) {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);
      fotoSrc = data?.signedUrl ?? null;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/incidencias"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Incidencias
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {i.folio}
          </h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              ESTADO_BADGE[i.estado] ?? "bg-zinc-100"
            }`}
          >
            {i.estado.replace(/_/g, " ")}
          </span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              SEVERIDAD_BADGE[i.severidad] ?? "bg-zinc-100"
            }`}
          >
            {i.severidad}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
            {i.tipo.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Contexto</h2>
          <dl className="space-y-2 text-sm">
            <Pair label="Reportada">
              {new Date(i.fecha_apertura).toLocaleString("es-MX")}
            </Pair>
            <Pair label="Operador">{op?.full_name ?? "—"}</Pair>
            <Pair label="Máquina">
              {maq ? (
                <>
                  <span className="font-mono">{maq.serie}</span>
                  {maq.alias && <span> · {maq.alias}</span>}
                </>
              ) : (
                "—"
              )}
            </Pair>
            {(cliente || ubic) && (
              <Pair label="Ubicación">
                {cliente?.nombre ?? ""}
                {cliente && ubic ? " · " : ""}
                {ubic?.nombre ?? ""}
              </Pair>
            )}
            {prod && (
              <Pair label="Producto afectado">
                <span className="font-medium">{prod.nombre}</span>
                <span className="ml-1 font-mono text-xs text-zinc-500">
                  {prod.sku}
                </span>
              </Pair>
            )}
            {i.cartuchos_afectados != null && (
              <Pair label="Cartuchos afectados">{i.cartuchos_afectados}</Pair>
            )}
            <Pair label="Requiere merma">
              {i.requiere_autorizacion_merma
                ? aut
                  ? `Autorizada por ${aut.full_name} el ${
                      i.fecha_autorizacion
                        ? new Date(i.fecha_autorizacion).toLocaleDateString(
                            "es-MX",
                          )
                        : "—"
                    }`
                  : "Pendiente"
                : "No"}
            </Pair>
            {i.fecha_cierre && (
              <Pair label="Cerrada">
                {new Date(i.fecha_cierre).toLocaleString("es-MX")}
              </Pair>
            )}
          </dl>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Descripción</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-700">
            {i.descripcion}
          </p>
          {i.notas_resolucion && (
            <>
              <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Notas de resolución
              </h3>
              <p className="whitespace-pre-wrap text-sm text-zinc-700">
                {i.notas_resolucion}
              </p>
            </>
          )}
          {fotoSrc && (
            <div>
              <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Foto
              </h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fotoSrc}
                alt="Evidencia"
                className="mt-1 max-h-96 w-full rounded-md border border-zinc-200 object-contain"
              />
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Acciones</h2>
        <IncidenciaForm
          id={i.id}
          estadoActual={i.estado}
          requiereMerma={i.requiere_autorizacion_merma}
          yaAutorizada={!!aut}
          notasIniciales={i.notas_resolucion ?? ""}
        />
      </section>
    </div>
  );
}

function Pair({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="col-span-2 text-zinc-900">{children}</dd>
    </div>
  );
}
