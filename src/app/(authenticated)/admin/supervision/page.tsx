import Link from "next/link";

import { requireRole } from "@/lib/auth";
import {
  fmtCDMX,
  fmtCDMXFechaCorta,
  isoFechaCDMX,
  startOfNDaysAgoCDMX,
  startOfTodayCDMX,
} from "@/lib/datetime";
import { urgenciaUltimaVisita } from "@/lib/maquinas-visita";
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

export default async function SupervisionDashboardPage({
  searchParams,
}: {
  searchParams: { periodo_op?: "mes" | "30d" };
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const hoyISO = isoFechaCDMX(new Date());
  const ayerISO = isoFechaCDMX(startOfNDaysAgoCDMX(1));
  const inicio30d = startOfNDaysAgoCDMX(30).toISOString();
  const inicioHoy = startOfTodayCDMX().toISOString();

  // Periodo para la tabla "Por operador": mes actual (default) o últimos 30 días.
  const periodoOp = searchParams.periodo_op === "30d" ? "30d" : "mes";
  const ahora = new Date();
  const inicioMesISO = `${ahora.getFullYear()}-${String(
    ahora.getMonth() + 1,
  ).padStart(2, "0")}-01`;
  const inicio30dISO = isoFechaCDMX(startOfNDaysAgoCDMX(30));
  const fechaDesdeOp = periodoOp === "30d" ? inicio30dISO : inicioMesISO;
  const fechaHastaOp = hoyISO;

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
      .select(
        `id, estado, ruta_id, operador_id,
         operador:profiles!asignaciones_diarias_operador_id_fkey(id, full_name),
         ruta:rutas(nombre, color_hex)`,
      )
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
  // Total para el denominador excluye canceladas (no son parte del plan
  // efectivo del día — si lo cancelaron, no cuenta contra completitud).
  const totalAsigHoy = (asignacionesHoy ?? []).filter(
    (a) => a.estado !== "cancelada",
  ).length;
  const completadasAyer = (asignacionesAyer ?? []).filter(
    (a) => a.estado === "completada",
  ).length;
  const totalAsigAyer = (asignacionesAyer ?? []).filter(
    (a) => a.estado !== "cancelada",
  ).length;

  // === Por operador (mes actual o últimos 30 días) ===
  const { data: asignacionesPorOp } = await supabase
    .from("asignaciones_diarias")
    .select(
      `id, fecha, estado, operador_id,
       operador:profiles!asignaciones_diarias_operador_id_fkey(id, full_name)`,
    )
    .gte("fecha", fechaDesdeOp)
    .lte("fecha", fechaHastaOp);

  type OpStats = {
    id: string;
    label: string;
    completas: number;
    parciales: number;
    en_curso: number;
    pendientes: number;
    canceladas: number;
    total: number;
  };
  const porOperadorMap = new Map<string, OpStats>();
  for (const a of asignacionesPorOp ?? []) {
    if (!a.operador_id) continue;
    const opRel = Array.isArray(a.operador) ? a.operador[0] : a.operador;
    const key = a.operador_id;
    const cur = porOperadorMap.get(key) ?? {
      id: key,
      label: opRel?.full_name ?? "—",
      completas: 0,
      parciales: 0,
      en_curso: 0,
      pendientes: 0,
      canceladas: 0,
      total: 0,
    };
    cur.total += 1;
    if (a.estado === "completada") cur.completas += 1;
    else if (a.estado === "completada_parcialmente") cur.parciales += 1;
    else if (a.estado === "en_jornada") cur.en_curso += 1;
    else if (a.estado === "cancelada") cur.canceladas += 1;
    else cur.pendientes += 1;
    porOperadorMap.set(key, cur);
  }
  const operadoresHoy = Array.from(porOperadorMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "es"),
  );

  // === Máquinas por antigüedad de visita ===
  const { data: maquinasVisita } = await supabase
    .from("maquinas")
    .select(
      `id, serie, alias, ultima_visita_at,
       ubicacion:ubicaciones(nombre, cliente:clientes(nombre))`,
    )
    .eq("activo", true);

  type MaqVisita = {
    id: string;
    serie: string;
    alias: string | null;
    ultima_visita_at: string | null;
    cliente: string;
    ubicacion: string;
    dias: number; // -1 = nunca
  };
  const maquinasUrgentes: MaqVisita[] = [];
  let countCritico = 0;
  let countUrgente = 0;
  for (const m of maquinasVisita ?? []) {
    const u = urgenciaUltimaVisita(m.ultima_visita_at);
    const dias = u.diasSinVisita ?? -1;
    // Solo contar críticos (8+ o nunca) y urgentes (6-7) para destacar
    if (dias === -1 || dias >= 6) {
      const ubic = Array.isArray(m.ubicacion) ? m.ubicacion[0] : m.ubicacion;
      const cliente = ubic
        ? Array.isArray(ubic.cliente)
          ? ubic.cliente[0]
          : ubic.cliente
        : null;
      maquinasUrgentes.push({
        id: m.id,
        serie: m.serie,
        alias: m.alias,
        ultima_visita_at: m.ultima_visita_at,
        cliente: cliente?.nombre ?? "—",
        ubicacion: ubic?.nombre ?? "—",
        dias,
      });
      if (dias === -1 || dias >= 8) countCritico += 1;
      else countUrgente += 1;
    }
  }
  // Orden: nunca primero, luego más días sin visita
  maquinasUrgentes.sort((a, b) => {
    if (a.dias === -1 && b.dias !== -1) return -1;
    if (b.dias === -1 && a.dias !== -1) return 1;
    return b.dias - a.dias;
  });

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
            value={`${completadasHoy} / ${totalAsigHoy}`}
            tone="zinc"
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Ayer: {visitAyer}/{planAyer} máquinas ({pctAyer}%) ·{" "}
          {completadasAyer}/{totalAsigAyer} rutas completadas.
        </p>
      </section>

      {/* === Por operador (periodo configurable) === */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Por operador
          </h2>
          <div className="inline-flex overflow-hidden rounded-md border border-zinc-300 text-xs">
            <Link
              href="/admin/supervision?periodo_op=mes"
              className={
                periodoOp === "mes"
                  ? "bg-zinc-900 px-3 py-1.5 font-medium text-white"
                  : "bg-white px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
              }
            >
              Mes actual
            </Link>
            <Link
              href="/admin/supervision?periodo_op=30d"
              className={
                periodoOp === "30d"
                  ? "bg-zinc-900 px-3 py-1.5 font-medium text-white"
                  : "bg-white px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
              }
            >
              Últimos 30 días
            </Link>
          </div>
        </div>
        {operadoresHoy.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No hay asignaciones en el periodo seleccionado.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Operador</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Completas
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Parciales
                  </th>
                  <th className="px-3 py-2 text-right font-medium">En curso</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Pendientes
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {operadoresHoy.map((op) => (
                  <tr key={op.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 text-zinc-800">{op.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-green-700">
                      {op.completas}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-orange-700">
                      {op.parciales}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                      {op.en_curso}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                      {op.pendientes}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-zinc-900">
                      {op.total - op.canceladas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* === Máquinas sin visita reciente === */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            Máquinas sin visita reciente
          </h2>
          <Link
            href="/admin/maquinas"
            className="text-sm text-blue-700 hover:underline"
          >
            Ver todas →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-red-300 bg-red-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-red-700">
              Crítico (8+ días o nunca)
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-red-900">
              {countCritico}
            </div>
          </div>
          <div className="rounded-lg border border-orange-300 bg-orange-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-orange-700">
              Urgente (6-7 días)
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-orange-900">
              {countUrgente}
            </div>
          </div>
        </div>
        {maquinasUrgentes.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Todas las máquinas se han visitado en los últimos 5 días.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Serie</th>
                  <th className="px-3 py-2 font-medium">Cliente / Ubicación</th>
                  <th className="px-3 py-2 font-medium">Última visita</th>
                  <th className="px-3 py-2 font-medium">Días</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {maquinasUrgentes.slice(0, 15).map((m) => {
                  const u = urgenciaUltimaVisita(m.ultima_visita_at);
                  return (
                    <tr key={m.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/admin/maquinas/${m.id}`}
                          className="font-mono text-xs font-medium text-zinc-900 hover:underline"
                        >
                          {m.serie}
                        </Link>
                        {m.alias && (
                          <div className="text-xs text-zinc-500">
                            {m.alias}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-zinc-700">
                        {m.cliente}
                        <div className="text-zinc-500">{m.ubicacion}</div>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-zinc-600">
                        {m.ultima_visita_at
                          ? fmtCDMXFechaCorta(m.ultima_visita_at)
                          : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${u.badgeClass}`}
                        >
                          {u.textoCorto} · {u.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {maquinasUrgentes.length > 15 && (
              <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-500">
                +{maquinasUrgentes.length - 15} más en{" "}
                <Link
                  href="/admin/maquinas"
                  className="text-blue-700 hover:underline"
                >
                  /admin/maquinas
                </Link>
              </div>
            )}
          </div>
        )}
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
