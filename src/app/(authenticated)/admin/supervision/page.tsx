import Link from "next/link";

import { requireRole } from "@/lib/auth";
import {
  fmtCDMX,
  fmtCDMXFechaCorta,
  isoFechaCDMX,
  startOfNDaysAgoCDMX,
  startOfTodayCDMX,
} from "@/lib/datetime";
import {
  ESTADO_BADGE as ERROR_ESTADO_BADGE,
  ESTADO_LABEL as ERROR_ESTADO_LABEL,
  MOTIVO_LABEL,
  type MotivoValue,
} from "@/lib/errores-operativos";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard supervisión · MuscleUp" };

const INCIDENCIA_SEVERIDAD_BADGE: Record<string, string> = {
  baja: "bg-zinc-100 text-zinc-600",
  media: "bg-amber-100 text-amber-700",
  alta: "bg-red-100 text-red-700",
};

export default async function SupervisionDashboardPage() {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const hoyISO = isoFechaCDMX(new Date());
  const ayerISO = isoFechaCDMX(startOfNDaysAgoCDMX(1));
  const inicio30d = startOfNDaysAgoCDMX(30).toISOString();
  const inicioHoy = startOfTodayCDMX().toISOString();

  // === KPIs operativos del día ===
  const [
    { data: asignacionesHoy },
    { data: maquinasPlaneadasHoy },
    { data: maquinasVisitadasHoy },
    { data: asignacionesAyer },
    { data: maquinasPlaneadasAyer },
    { data: maquinasVisitadasAyer },
  ] = await Promise.all([
    supabase
      .from("asignaciones_diarias")
      .select("id, estado, ruta_id, operador_id")
      .eq("fecha", hoyISO),
    supabase
      .from("asignacion_maquinas")
      .select("maquina_id, asignacion_id, asignacion:asignaciones_diarias!inner(fecha)")
      .eq("asignacion.fecha", hoyISO),
    supabase
      .from("check_ins")
      .select("maquina_id, asignacion_id, asignacion:asignaciones_diarias!inner(fecha)")
      .eq("asignacion.fecha", hoyISO),
    supabase
      .from("asignaciones_diarias")
      .select("id, estado")
      .eq("fecha", ayerISO),
    supabase
      .from("asignacion_maquinas")
      .select("maquina_id, asignacion:asignaciones_diarias!inner(fecha)")
      .eq("asignacion.fecha", ayerISO),
    supabase
      .from("check_ins")
      .select("maquina_id, asignacion:asignaciones_diarias!inner(fecha)")
      .eq("asignacion.fecha", ayerISO),
  ]);

  const planHoy = (maquinasPlaneadasHoy ?? []).length;
  const visitadasHoyIds = new Set(
    (maquinasVisitadasHoy ?? []).map((c) => c.maquina_id),
  );
  const visitHoy = visitadasHoyIds.size;
  const pctHoy = planHoy > 0 ? Math.round((visitHoy / planHoy) * 100) : 0;
  const pendientesHoy = Math.max(0, planHoy - visitHoy);

  const planAyer = (maquinasPlaneadasAyer ?? []).length;
  const visitAyerIds = new Set(
    (maquinasVisitadasAyer ?? []).map((c) => c.maquina_id),
  );
  const visitAyer = visitAyerIds.size;
  const pctAyer = planAyer > 0 ? Math.round((visitAyer / planAyer) * 100) : 0;

  const jornadasActivasHoy = (asignacionesHoy ?? []).filter(
    (a) => a.estado === "en_jornada",
  ).length;
  const completadasHoy = (asignacionesHoy ?? []).filter(
    (a) => a.estado === "completada",
  ).length;
  const completadasAyer = (asignacionesAyer ?? []).filter(
    (a) => a.estado === "completada",
  ).length;

  // === Errores operativos últimos 30 días ===
  const { data: errores30d } = await supabase
    .from("errores_operativos")
    .select(
      `id, motivo, estado, fecha, descripcion,
       operador:profiles!errores_operativos_operador_id_fkey(id, full_name),
       ruta:rutas(id, nombre, color_hex),
       maquina:maquinas(serie, alias)`,
    )
    .gte("fecha", inicio30d)
    .order("fecha", { ascending: false })
    .range(0, 9999);

  const errores = errores30d ?? [];
  const erroresAbiertos = errores.filter((e) => e.estado === "abierto").length;
  const erroresHoy = errores.filter((e) => e.fecha >= inicioHoy).length;

  // Por motivo
  const porMotivo = new Map<string, number>();
  for (const e of errores) {
    porMotivo.set(e.motivo, (porMotivo.get(e.motivo) ?? 0) + 1);
  }
  const motivosOrdenados = Array.from(porMotivo.entries()).sort(
    (a, b) => b[1] - a[1],
  );

  // Por operador
  type AggRow = { id: string; label: string; total: number };
  const porOperador = new Map<string, AggRow>();
  for (const e of errores) {
    const op = Array.isArray(e.operador) ? e.operador[0] : e.operador;
    if (!op) continue;
    const cur = porOperador.get(op.id) ?? {
      id: op.id,
      label: op.full_name ?? "—",
      total: 0,
    };
    cur.total += 1;
    porOperador.set(op.id, cur);
  }
  const operadoresOrdenados = Array.from(porOperador.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Por ruta
  const porRuta = new Map<string, AggRow & { color: string | null }>();
  for (const e of errores) {
    const r = Array.isArray(e.ruta) ? e.ruta[0] : e.ruta;
    if (!r) continue;
    const cur = porRuta.get(r.id) ?? {
      id: r.id,
      label: r.nombre,
      color: r.color_hex,
      total: 0,
    };
    cur.total += 1;
    porRuta.set(r.id, cur);
  }
  const rutasOrdenadas = Array.from(porRuta.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Tendencia diaria 30d
  const porDia = new Map<string, number>();
  for (const e of errores) {
    const dia = isoFechaCDMX(e.fecha);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }
  const serieDias: { fecha: string; total: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const f = isoFechaCDMX(startOfNDaysAgoCDMX(i));
    serieDias.push({ fecha: f, total: porDia.get(f) ?? 0 });
  }
  const maxDia = Math.max(1, ...serieDias.map((d) => d.total));

  // Errores recientes (top 10)
  const erroresRecientes = errores.slice(0, 10);

  // === Health checks (resumen) ===
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: healthChecksRaw } = await (supabase as any)
    .from("v_health_checks")
    .select("severidad");
  const healthOk = (healthChecksRaw ?? []).filter(
    (h: { severidad: string }) => h.severidad === "ok",
  ).length;
  const healthWarn = (healthChecksRaw ?? []).filter(
    (h: { severidad: string }) => h.severidad === "advertencia",
  ).length;
  const healthCrit = (healthChecksRaw ?? []).filter(
    (h: { severidad: string }) => h.severidad === "critico",
  ).length;
  const healthTotal = (healthChecksRaw ?? []).length;

  // === Incidencias ===
  const { data: incidenciasRaw } = await supabase
    .from("incidencias")
    .select(
      `id, folio, tipo, severidad, estado, descripcion, fecha_apertura,
       requiere_autorizacion_merma, autorizada_por,
       maquina:maquinas(serie, alias),
       operador:profiles!incidencias_operador_id_fkey(full_name)`,
    )
    .gte("fecha_apertura", inicio30d)
    .order("fecha_apertura", { ascending: false })
    .range(0, 999);

  const incidencias = incidenciasRaw ?? [];
  const incAbiertas = incidencias.filter((i) => i.estado === "abierta").length;
  const incEnRevision = incidencias.filter(
    (i) => i.estado === "en_revision",
  ).length;
  const incAlta = incidencias.filter(
    (i) =>
      i.severidad === "alta" &&
      (i.estado === "abierta" || i.estado === "en_revision"),
  ).length;
  const incPendMerma = incidencias.filter(
    (i) =>
      i.requiere_autorizacion_merma &&
      !i.autorizada_por &&
      (i.estado === "abierta" || i.estado === "en_revision"),
  ).length;

  const incidenciasRelevantes = incidencias
    .filter((i) => i.estado === "abierta" || i.estado === "en_revision")
    .sort((a, b) => {
      const sev = { alta: 0, media: 1, baja: 2 } as const;
      const sa = sev[a.severidad as keyof typeof sev] ?? 3;
      const sb = sev[b.severidad as keyof typeof sev] ?? 3;
      if (sa !== sb) return sa - sb;
      return b.fecha_apertura.localeCompare(a.fecha_apertura);
    })
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Dashboard supervisión
        </h1>
        <p className="text-sm text-zinc-600">
          KPIs operativos del día, errores observados por supervisión y
          resumen de incidencias.
        </p>
      </div>

      {/* === Health check (banner) === */}
      <Link
        href="/admin/supervision/health"
        className={`block rounded-lg border p-3 transition hover:shadow-sm ${
          healthCrit > 0
            ? "border-red-200 bg-red-50"
            : healthWarn > 0
              ? "border-amber-200 bg-amber-50"
              : "border-green-200 bg-green-50"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`text-xl ${
                healthCrit > 0
                  ? "text-red-700"
                  : healthWarn > 0
                    ? "text-amber-700"
                    : "text-green-700"
              }`}
            >
              {healthCrit > 0 ? "⛔" : healthWarn > 0 ? "⚠️" : "✓"}
            </span>
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                Health check del sistema
              </div>
              <div className="text-xs text-zinc-600">
                {healthCrit > 0
                  ? `${healthCrit} críticos · ${healthWarn} advertencias`
                  : healthWarn > 0
                    ? `${healthWarn} advertencias activas`
                    : `${healthOk}/${healthTotal} validaciones OK`}
              </div>
            </div>
          </div>
          <span className="text-xs text-zinc-500">Ver detalle →</span>
        </div>
      </Link>

      {/* === KPIs del día === */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Hoy · {fmtCDMXFechaCorta(new Date())}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Máquinas planeadas" value={String(planHoy)} />
          <Stat
            label="Máquinas visitadas"
            value={String(visitHoy)}
            tone={pctHoy >= 80 ? "green" : pctHoy >= 50 ? "amber" : "red"}
            sub={`${pctHoy}%`}
          />
          <Stat
            label="Pendientes"
            value={String(pendientesHoy)}
            tone={pendientesHoy === 0 ? "green" : "amber"}
          />
          <Stat
            label="Jornadas activas"
            value={String(jornadasActivasHoy)}
            tone="zinc"
          />
          <Stat
            label="Rutas completadas"
            value={`${completadasHoy} / ${(asignacionesHoy ?? []).length}`}
            tone="zinc"
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Ayer: {visitAyer}/{planAyer} máquinas ({pctAyer}%) ·{" "}
          {completadasAyer} rutas completadas.
        </p>
      </section>

      {/* === Errores operativos === */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            Errores operativos · últimos 30d
          </h2>
          <Link
            href="/admin/errores-operativos"
            className="text-sm text-blue-700 hover:underline"
          >
            Ver todos →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Hoy"
            value={String(erroresHoy)}
            tone={erroresHoy > 0 ? "amber" : "green"}
          />
          <Stat
            label="Abiertos"
            value={String(erroresAbiertos)}
            tone={erroresAbiertos > 0 ? "amber" : "green"}
          />
          <Stat label="Total 30d" value={String(errores.length)} tone="zinc" />
          <Stat
            label="Operadores afectados"
            value={String(porOperador.size)}
            tone="zinc"
          />
        </div>

        {/* Tendencia + Top motivos */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Tendencia diaria
            </div>
            <div className="mt-3 flex h-32 items-end gap-px">
              {serieDias.map((d) => {
                const h = (d.total / maxDia) * 100;
                return (
                  <div
                    key={d.fecha}
                    className="flex-1 rounded-t-sm bg-zinc-200"
                    style={{ height: `${Math.max(2, h)}%` }}
                    title={`${d.fecha}: ${d.total}`}
                  >
                    {d.total > 0 && (
                      <div
                        className="h-full rounded-t-sm bg-amber-500"
                        style={{ height: "100%" }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
              <span>{serieDias[0].fecha}</span>
              <span>{serieDias[serieDias.length - 1].fecha}</span>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Top motivos
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {motivosOrdenados.length === 0 && (
                <li className="text-zinc-400">Sin errores en 30d.</li>
              )}
              {motivosOrdenados.map(([motivo, total]) => {
                const pct = Math.round((total / errores.length) * 100);
                return (
                  <li key={motivo} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs">
                          {MOTIVO_LABEL[motivo as MotivoValue] ?? motivo}
                        </span>
                        <span className="text-xs tabular-nums text-zinc-500">
                          {total} ({pct}%)
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Por operador + Por ruta */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Top operadores con errores
            </div>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {operadoresOrdenados.length === 0 && (
                  <tr>
                    <td className="py-2 text-zinc-400">Sin datos.</td>
                  </tr>
                )}
                {operadoresOrdenados.map((o) => (
                  <tr key={o.id}>
                    <td className="py-1.5 text-xs">{o.label}</td>
                    <td className="py-1.5 text-right text-xs tabular-nums">
                      <Link
                        href={`/admin/errores-operativos?operador=${o.id}&estado=todos`}
                        className="text-zinc-700 hover:underline"
                      >
                        {o.total}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Top rutas con errores
            </div>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {rutasOrdenadas.length === 0 && (
                  <tr>
                    <td className="py-2 text-zinc-400">Sin datos.</td>
                  </tr>
                )}
                {rutasOrdenadas.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: r.color ?? "#a1a1aa" }}
                        />
                        {r.label}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-xs tabular-nums">
                      <Link
                        href={`/admin/errores-operativos?ruta=${r.id}&estado=todos`}
                        className="text-zinc-700 hover:underline"
                      >
                        {r.total}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Errores recientes */}
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Errores recientes
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100">
              {erroresRecientes.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-zinc-500">
                    Sin errores operativos en los últimos 30 días.
                  </td>
                </tr>
              )}
              {erroresRecientes.map((e) => {
                const op = Array.isArray(e.operador)
                  ? e.operador[0]
                  : e.operador;
                const r = Array.isArray(e.ruta) ? e.ruta[0] : e.ruta;
                const m = Array.isArray(e.maquina) ? e.maquina[0] : e.maquina;
                return (
                  <tr key={e.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {fmtCDMX(e.fecha, {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {MOTIVO_LABEL[e.motivo]}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {op?.full_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r?.nombre ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {m?.serie ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          ERROR_ESTADO_BADGE[e.estado]
                        }`}
                      >
                        {ERROR_ESTADO_LABEL[e.estado]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <Link
                        href={`/admin/errores-operativos/${e.id}`}
                        className="text-blue-700 hover:underline"
                      >
                        Abrir →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* === Incidencias === */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            Incidencias · últimos 30d
          </h2>
          <Link
            href="/admin/incidencias"
            className="text-sm text-blue-700 hover:underline"
          >
            Ver todas →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Abiertas"
            value={String(incAbiertas)}
            tone={incAbiertas > 0 ? "red" : "green"}
          />
          <Stat
            label="En revisión"
            value={String(incEnRevision)}
            tone={incEnRevision > 0 ? "amber" : "green"}
          />
          <Stat
            label="Severidad alta activas"
            value={String(incAlta)}
            tone={incAlta > 0 ? "red" : "green"}
          />
          <Stat
            label="Pend. autorizar merma"
            value={String(incPendMerma)}
            tone={incPendMerma > 0 ? "amber" : "green"}
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Activas más relevantes (alta → media → baja)
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100">
              {incidenciasRelevantes.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-zinc-500">
                    No hay incidencias activas.
                  </td>
                </tr>
              )}
              {incidenciasRelevantes.map((i) => {
                const m = Array.isArray(i.maquina) ? i.maquina[0] : i.maquina;
                const op = Array.isArray(i.operador)
                  ? i.operador[0]
                  : i.operador;
                return (
                  <tr key={i.id} className="hover:bg-zinc-50 align-top">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={`/admin/incidencias/${i.id}`}
                        className="hover:underline"
                      >
                        {i.folio}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {fmtCDMX(i.fecha_apertura, {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {i.tipo.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          INCIDENCIA_SEVERIDAD_BADGE[i.severidad] ??
                          "bg-zinc-100"
                        }`}
                      >
                        {i.severidad}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {m?.serie ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {op?.full_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {i.descripcion ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "amber" | "red" | "zinc";
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "red"
          ? "text-red-700"
          : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 flex items-baseline gap-2 ${color}`}>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-sm font-medium">{sub}</div>}
      </div>
    </div>
  );
}
