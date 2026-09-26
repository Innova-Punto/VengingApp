import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import type { PlanRuta } from "@/lib/ruteo/correr";
import { createClient } from "@/lib/supabase/server";

import DescartarForm from "./DescartarForm";
import { COLORES } from "./colores";
import type { FueraMapa, RutaMapa } from "./MapaRutas";
import MapaRutasLazy from "./MapaRutasLazy";
import GenerarButton from "./GenerarButton";
import { aceptarPropuesta, generarPropuesta } from "./actions";

export const metadata = { title: "Propuesta del agente · Innovaypunto" };
export const dynamic = "force-dynamic";
/**
 * El botón corre el agente dentro de esta ruta, y una corrida tarda entre dos
 * y tres minutos. Sin este techo, la función se moría a media corrida: el
 * usuario veía la animación para siempre y en la base no aparecía nada, ni
 * siquiera el error, porque el proceso se mataba antes de poder escribirlo.
 */
export const maxDuration = 300;

type MaquinaRef = {
  serie: string;
  alias: string | null;
  lat: number | null;
  lng: number | null;
};

export default async function AgentePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireRole("admin", "direccion", "planeador");
  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propuesta } = await (supabase as any)
    .from("propuestas_ruteo")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Nombres de máquina: el plan guarda ids, y un uuid no le dice nada a nadie.
  const plan = (propuesta?.plan ?? []) as PlanRuta[];
  const ids = new Set<string>();
  for (const r of plan) {
    for (const p of r.paradas) ids.add(p.maquina_id);
    // Las recortadas también llevan nombre: un pedazo de uuid no le dice nada
    // a nadie, y son justo las que hay que mirar para decidir si mover algo.
    for (const c of r.recortadas) ids.add(c.maquina_id);
  }
  for (const e of (propuesta?.escalamientos ?? []) as { maquina_id: string }[]) {
    ids.add(e.maquina_id);
  }
  for (const s of (propuesta?.sin_atender ?? []) as { maquina_id: string }[]) {
    ids.add(s.maquina_id);
  }

  const { data: maquinas } = ids.size
    ? await supabase
        .from("maquinas")
        .select("id, serie, alias, ubicacion:ubicaciones(lat, lng)")
        .in("id", Array.from(ids))
    : { data: [] };
  const porId = new Map<string, MaquinaRef>(
    (maquinas ?? []).map((m) => {
      const u = Array.isArray(m.ubicacion) ? m.ubicacion[0] : m.ubicacion;
      return [
        m.id,
        {
          serie: m.serie,
          alias: m.alias,
          lat: u?.lat ?? null,
          lng: u?.lng ?? null,
        },
      ];
    }),
  );
  const nombre = (id: string) => {
    const m = porId.get(id);
    return m ? `${m.serie} ${m.alias ?? ""}`.trim() : id.slice(0, 8);
  };

  const totalParadas = plan.reduce((s, r) => s + r.paradas.length, 0);
  const totalKm = Math.round(plan.reduce((s, r) => s + r.km_total, 0) * 10) / 10;
  const recortadas = plan.flatMap((r) =>
    r.recortadas.map((c) => ({ ...c, operador: r.operador_nombre })),
  );

  // ── Mapa ──────────────────────────────────────────────────────────────────
  // El CEDIS es de donde salen todas y a donde cierra la camioneta: sin él la
  // secuencia no se entiende, porque la primera parada no es el principio.
  const { data: cedisRow } = await supabase
    .from("centros_distribucion")
    .select("lat, lng")
    .eq("activo", true)
    .limit(1)
    .maybeSingle();
  const cedis = cedisRow
    ? { lat: Number(cedisRow.lat), lng: Number(cedisRow.lng) }
    : null;

  const conCoords = (id: string) => {
    const m = porId.get(id);
    return m?.lat != null && m?.lng != null
      ? { lat: m.lat, lng: m.lng }
      : null;
  };

  const rutasMapa: RutaMapa[] = plan.map((r) => ({
    operador_id: r.operador_id,
    operador_nombre: r.operador_nombre,
    vehiculo: r.vehiculo,
    lleva_agua: r.lleva_agua,
    km_total: r.km_total,
    horas_estimadas: r.horas_estimadas,
    // Hoy solo la camioneta cierra en el CEDIS; se deduce de quién lleva agua.
    regresa_a_resguardo: r.lleva_agua,
    paradas: r.paradas.flatMap((p) => {
      const c = conCoords(p.maquina_id);
      return c
        ? [{
            maquina_id: p.maquina_id,
            nombre: nombre(p.maquina_id),
            orden: p.orden,
            motivo: p.motivo,
            km_desde_anterior: p.km_desde_anterior,
            ...c,
          }]
        : [];
    }),
  }));

  const sinAtenderMapa: FueraMapa[] = (
    (propuesta?.sin_atender ?? []) as { maquina_id: string; motivo: string }[]
  ).flatMap((f) => {
    const c = conCoords(f.maquina_id);
    return c
      ? [{ maquina_id: f.maquina_id, nombre: nombre(f.maquina_id), motivo: f.motivo, ...c }]
      : [];
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/planeacion/asignaciones"
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Asignaciones
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            🤖 Propuesta del agente
          </h1>
          <p className="text-sm text-zinc-600">
            El agente propone; tú decides. Si no te sirve, descártala y arma la
            ruta como siempre — nada se bloquea.
          </p>
        </div>
        <form action={generarPropuesta}>
          <GenerarButton />
        </form>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(searchParams.error)}
        </p>
      )}

      {!propuesta && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Todavía no hay ninguna propuesta. El agente corre solo a las 6:00 de
          la mañana; si la quieres ahora, usa el botón de arriba.
        </div>
      )}

      {propuesta?.estado === "error" && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-medium">La última corrida falló.</div>
          <div className="mt-1 font-mono text-xs">{propuesta.error}</div>
          <div className="mt-2 text-xs">
            {fmtCDMX(propuesta.created_at, {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      )}

      {propuesta && propuesta.estado !== "error" && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                propuesta.estado === "generada"
                  ? "bg-blue-100 text-blue-700"
                  : propuesta.estado === "aceptada"
                    ? "bg-green-100 text-green-700"
                    : "bg-zinc-200 text-zinc-600"
              }`}
            >
              {propuesta.estado}
            </span>
            <span className="text-zinc-600">
              Para el <strong>{propuesta.fecha}</strong> · {plan.length} rutas ·{" "}
              {totalParadas} paradas · {totalKm} km
            </span>
            <span className="text-xs text-zinc-400">
              {propuesta.fuente === "cron" ? "automática" : "a petición"} ·{" "}
              {fmtCDMX(propuesta.created_at, {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {propuesta.costo_usd != null &&
                ` · costó $${Number(propuesta.costo_usd).toFixed(2)} USD`}
            </span>
          </div>

          {propuesta.notas && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-amber-800">
                Lo que el agente quiere que sepas
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
                {propuesta.notas}
              </p>
            </div>
          )}

          {/* ── Mapa ───────────────────────────────────────────────────────── */}
          {rutasMapa.some((r) => r.paradas.length > 0) && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {rutasMapa.map((r, i) => (
                  <span key={r.operador_id} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: COLORES[i % COLORES.length] }}
                    />
                    <span className="font-medium">{r.operador_nombre}</span>
                    <span className="text-zinc-500">
                      {r.paradas.length} paradas · {r.km_total} km
                    </span>
                  </span>
                ))}
                {sinAtenderMapa.length > 0 && (
                  <span className="flex items-center gap-1.5 text-zinc-500">
                    <span className="inline-block h-3 w-3 rounded-full border border-zinc-400 bg-zinc-300" />
                    sin atender hoy
                  </span>
                )}
              </div>
              <MapaRutasLazy
                rutas={rutasMapa}
                cedis={cedis}
                sinAtender={sinAtenderMapa}
              />
              <p className="text-xs text-zinc-500">
                El número es el orden de la parada. Las líneas salen del CEDIS;
                la de la camioneta cierra ahí de regreso.
              </p>
            </div>
          )}

          {/* ── Rutas ──────────────────────────────────────────────────────── */}
          <div className="space-y-4">
            {plan.map((ruta, i) => (
              <section
                key={ruta.operador_id}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
              >
                <div
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 border-l-4"
                  style={{ borderLeftColor: COLORES[i % COLORES.length] }}
                >
                  <div>
                    <span className="font-semibold">{ruta.operador_nombre}</span>
                    <span className="ml-2 text-xs text-zinc-500">
                      {ruta.puesto}
                      {ruta.vehiculo ? ` · ${ruta.vehiculo}` : ""}
                      {ruta.lleva_agua && " · lleva agua"}
                    </span>
                  </div>
                  <div className="text-xs tabular-nums text-zinc-600">
                    {ruta.paradas.length} paradas · {ruta.km_total} km ·{" "}
                    <span
                      className={
                        ruta.horas_estimadas > 8 ? "font-semibold text-red-700" : ""
                      }
                    >
                      {ruta.horas_estimadas} h
                    </span>
                  </div>
                </div>

                <ol className="divide-y divide-zinc-100">
                  {ruta.paradas.map((p) => (
                    <li key={p.maquina_id} className="flex gap-3 px-4 py-2.5">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                        {p.orden}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {nombre(p.maquina_id)}
                          <span className="ml-2 text-xs font-normal text-zinc-400">
                            {p.km_desde_anterior} km
                          </span>
                        </div>
                        <div className="text-xs text-zinc-600">{p.motivo}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>

          {/* ── Lo que no entró ────────────────────────────────────────────── */}
          {(recortadas.length > 0 ||
            (propuesta.sin_atender ?? []).length > 0 ||
            (propuesta.escalamientos ?? []).length > 0) && (
            <div className="grid gap-4 md:grid-cols-3">
              {(propuesta.escalamientos ?? []).length > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                  <h3 className="text-sm font-semibold text-orange-900">
                    Escalamientos
                  </h3>
                  <p className="mt-1 text-xs text-orange-800">
                    No las mandes a resurtir: el surtido no las arregla.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {(
                      propuesta.escalamientos as { maquina_id: string; motivo: string }[]
                    ).map((e) => (
                      <li key={e.maquina_id} className="text-xs text-orange-900">
                        <span className="font-medium">{nombre(e.maquina_id)}</span>
                        <div className="text-orange-800">{e.motivo}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(propuesta.sin_atender ?? []).length > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-white p-4">
                  <h3 className="text-sm font-semibold">Sin atender hoy</h3>
                  <p className="mt-1 text-xs text-zinc-600">
                    El agente las dejó fuera y dice por qué.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {(
                      propuesta.sin_atender as { maquina_id: string; motivo: string }[]
                    ).map((s) => (
                      <li key={s.maquina_id} className="text-xs">
                        <span className="font-medium">{nombre(s.maquina_id)}</span>
                        <div className="text-zinc-600">{s.motivo}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recortadas.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <h3 className="text-sm font-semibold text-red-900">
                    Recortadas por el sistema
                  </h3>
                  <p className="mt-1 text-xs text-red-800">
                    El agente las propuso y no cupieron en la jornada.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {recortadas.map((c) => (
                      <li key={c.maquina_id} className="text-xs text-red-900">
                        <span className="font-medium">{nombre(c.maquina_id)}</span>
                        <span className="text-red-700"> · {c.operador}</span>
                        <div className="text-red-800">{c.motivo}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Decisión ───────────────────────────────────────────────────── */}
          {propuesta.estado === "generada" && (
            <div className="flex flex-wrap items-start gap-3 rounded-lg border border-zinc-300 bg-zinc-50 p-4">
              <form action={aceptarPropuesta}>
                <input type="hidden" name="propuesta_id" value={propuesta.id} />
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Aceptar y crear las asignaciones
                </button>
              </form>
              <DescartarForm propuestaId={propuesta.id} />
              <p className="w-full text-xs text-zinc-500">
                Aceptar crea las asignaciones del día con el orden propuesto; de
                ahí las puedes editar como siempre.{" "}
                <Link href="/planeacion/asignaciones/dinamica" className="underline">
                  Armarla a mano
                </Link>{" "}
                sigue disponible.
              </p>
            </div>
          )}

          {propuesta.estado === "descartada" && propuesta.motivo_descarte && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Por qué se descartó
              </span>
              <p className="mt-1 text-zinc-700">{propuesta.motivo_descarte}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
