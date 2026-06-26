import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import {
  ESTADO_BADGE,
  ESTADO_LABEL,
  MOTIVO_LABEL,
} from "@/lib/errores-operativos";
import { createClient } from "@/lib/supabase/server";

import { EstadoForm } from "./EstadoForm";

export const metadata = { title: "Error operativo · Innovaypunto" };

export default async function ErrorOperativoDetallePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const { data: err } = await supabase
    .from("errores_operativos")
    .select(
      `id, motivo, estado, descripcion, fecha, nota_resolucion, resuelto_at,
       ruta:rutas(id, nombre, color_hex),
       operador:profiles!errores_operativos_operador_id_fkey(id, full_name),
       maquina:maquinas(id, serie, alias),
       asignacion:asignaciones_diarias(id, fecha),
       levantado_por_profile:profiles!errores_operativos_levantado_por_fkey(full_name),
       resuelto_por_profile:profiles!errores_operativos_resuelto_por_fkey(full_name)`,
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!err) notFound();

  const ruta = Array.isArray(err.ruta) ? err.ruta[0] : err.ruta;
  const op = Array.isArray(err.operador) ? err.operador[0] : err.operador;
  const maq = Array.isArray(err.maquina) ? err.maquina[0] : err.maquina;
  const asig = Array.isArray(err.asignacion)
    ? err.asignacion[0]
    : err.asignacion;
  const levantadoPor = Array.isArray(err.levantado_por_profile)
    ? err.levantado_por_profile[0]
    : err.levantado_por_profile;
  const resueltoPor = Array.isArray(err.resuelto_por_profile)
    ? err.resuelto_por_profile[0]
    : err.resuelto_por_profile;

  // Buscar jornada por asignacion para link de vuelta
  const { data: jornada } = asig
    ? await supabase
        .from("jornadas")
        .select("id")
        .eq("asignacion_id", asig.id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/errores-operativos"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Errores operativos
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {MOTIVO_LABEL[err.motivo]}
          </h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              ESTADO_BADGE[err.estado]
            }`}
          >
            {ESTADO_LABEL[err.estado]}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          Levantado por {levantadoPor?.full_name ?? "—"} ·{" "}
          {fmtCDMX(err.fecha, {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Operador
          </div>
          <div className="mt-1">{op?.full_name ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Ruta
          </div>
          <div className="mt-1">
            {ruta ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: ruta.color_hex ?? "#a1a1aa" }}
                />
                {ruta.nombre}
              </span>
            ) : (
              <span className="text-zinc-400">—</span>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Máquina
          </div>
          <div className="mt-1 font-mono text-xs">
            {maq?.serie ?? <span className="text-zinc-400">—</span>}
            {maq?.alias && (
              <div className="font-sans text-xs text-zinc-500">{maq.alias}</div>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Jornada
          </div>
          <div className="mt-1">
            {asig ? (
              jornada ? (
                <Link
                  href={`/admin/jornadas/${jornada.id}`}
                  className="text-blue-700 hover:underline"
                >
                  {asig.fecha} →
                </Link>
              ) : (
                asig.fecha
              )
            ) : (
              <span className="text-zinc-400">—</span>
            )}
          </div>
        </div>
      </section>

      {err.descripcion && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Descripción
          </div>
          <p className="mt-1 whitespace-pre-wrap text-zinc-700">
            {err.descripcion}
          </p>
        </div>
      )}

      {err.estado !== "abierto" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Resolución
          </div>
          <p className="mt-1 text-zinc-700">
            {resueltoPor?.full_name ?? "—"} ·{" "}
            {err.resuelto_at
              ? fmtCDMX(err.resuelto_at, {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </p>
          {err.nota_resolucion && (
            <p className="mt-1 whitespace-pre-wrap text-zinc-600">
              {err.nota_resolucion}
            </p>
          )}
        </div>
      )}

      <EstadoForm id={err.id} estadoActual={err.estado} />
    </div>
  );
}
