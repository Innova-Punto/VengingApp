import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import IniciarJornadaForm from "./IniciarJornadaForm";

export default async function JornadaPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireRole("operador", "admin", "direccion");
  const supabase = createClient();

  const { data: asig } = await supabase
    .from("asignaciones_diarias")
    .select(
      `id, fecha, estado, operador_id,
       ruta:rutas(nombre, color_hex),
       jornada:jornadas(id, hora_inicio),
       maquinas:asignacion_maquinas(
         orden,
         maquina:maquinas(
           id, serie, alias,
           ubicacion:ubicaciones(nombre, cliente:clientes(nombre))
         )
       )`,
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!asig) notFound();

  const esSuya = asig.operador_id === user.id;
  const esAdmin =
    user.roles.includes("admin") || user.roles.includes("direccion");
  if (!esSuya && !esAdmin) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Esta asignación no es tuya.
      </p>
    );
  }

  const ruta = Array.isArray(asig.ruta) ? asig.ruta[0] : asig.ruta;
  const jornada = Array.isArray(asig.jornada) ? asig.jornada[0] : asig.jornada;

  const maquinasOrdenadas = (asig.maquinas ?? [])
    .slice()
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  // Check-ins existentes para esta asignación (para mostrar estado por máquina)
  const { data: checkIns } = await supabase
    .from("check_ins")
    .select("id, maquina_id, fecha_entrada, fecha_salida")
    .eq("asignacion_id", asig.id);

  const checkInPorMaquina = new Map<
    string,
    { id: string; cerrado: boolean }
  >();
  for (const ci of checkIns ?? []) {
    checkInPorMaquina.set(ci.maquina_id, {
      id: ci.id,
      cerrado: !!ci.fecha_salida,
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/campo"
          className="text-sm text-zinc-600 active:text-zinc-900"
        >
          ← Hoy
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <div
            className="h-10 w-1.5 rounded-sm"
            style={{ backgroundColor: ruta?.color_hex ?? "#a1a1aa" }}
          />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {ruta?.nombre ?? "Ruta"}
            </h1>
            <p className="text-xs text-zinc-500">
              {maquinasOrdenadas.length} máquinas
            </p>
          </div>
        </div>
      </div>

      {!jornada && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm text-zinc-700">
            Inicia tu jornada para registrar visitas. Vamos a usar tu ubicación
            para marcar la hora y lugar de inicio.
          </p>
          <IniciarJornadaForm asignacionId={asig.id} />
        </div>
      )}

      {jornada && (
        <p className="text-xs text-zinc-500">
          Jornada iniciada:{" "}
          {fmtCDMX(jornada.hora_inicio, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Máquinas
        </h2>
        {maquinasOrdenadas.map((am) => {
          const m = Array.isArray(am.maquina) ? am.maquina[0] : am.maquina;
          if (!m) return null;
          const ubic = Array.isArray(m.ubicacion) ? m.ubicacion[0] : m.ubicacion;
          const cliente = ubic
            ? Array.isArray(ubic.cliente)
              ? ubic.cliente[0]
              : ubic.cliente
            : null;
          const ci = checkInPorMaquina.get(m.id);
          const estado: "pendiente" | "en_curso" | "completada" = ci?.cerrado
            ? "completada"
            : ci
              ? "en_curso"
              : "pendiente";
          const badge =
            estado === "completada"
              ? "bg-green-100 text-green-700"
              : estado === "en_curso"
                ? "bg-amber-100 text-amber-700"
                : "bg-zinc-100 text-zinc-600";
          const label =
            estado === "completada"
              ? "✓ Visitada"
              : estado === "en_curso"
                ? "En curso"
                : "Pendiente";

          return (
            <Link
              key={m.id}
              href={`/campo/maquinas/${m.id}?asignacion=${asig.id}`}
              className="block rounded-lg border border-zinc-200 bg-white p-3 shadow-sm active:bg-zinc-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-medium text-zinc-900">
                    {m.serie}
                  </div>
                  {m.alias && (
                    <div className="text-xs text-zinc-600">{m.alias}</div>
                  )}
                  {(cliente || ubic) && (
                    <div className="text-xs text-zinc-500">
                      {cliente?.nombre ?? ""}
                      {cliente && ubic ? " · " : ""}
                      {ubic?.nombre ?? ""}
                    </div>
                  )}
                </div>
                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}
                >
                  {label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
