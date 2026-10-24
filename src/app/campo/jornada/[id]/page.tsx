import Link from "next/link";
import { notFound } from "next/navigation";

import { litrosASugerir, mlALitros } from "@/lib/agua";
import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import CerrarIncompletaButton from "./CerrarIncompletaButton";
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
           id, serie, alias, vaso_inventario_actual,
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

  // ── Estado de cada máquina ANTES de llegar ────────────────────────────────
  // Los operadores lo pidieron para decidir en el camino, sobre todo el agua:
  // la moto no carga garrafones, así que si una máquina va baja, la única
  // forma de resolverlo es pasar a comprar — y eso se decide antes, no al
  // llegar y encontrarse el tanque vacío.
  const ids = maquinasOrdenadas
    .map((am) => {
      const m = Array.isArray(am.maquina) ? am.maquina[0] : am.maquina;
      return m?.id;
    })
    .filter((x): x is string => !!x);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: aguaRows }, { data: tolvaRows }, { data: incRows }, { data: quejaRows }] =
    ids.length === 0
      ? [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]
      : await Promise.all([
          sb
            .from("v_agua_maquina")
            .select(
              "maquina_id, ml_estimado, agua_capacidad_ml, dias_para_vaciarse, sin_medicion",
            )
            .in("maquina_id", ids),
          sb
            .from("tolvas")
            .select(
              "maquina_id, numero, inventario_actual_g, capacidad_max_g, capacidad_max_g_override, producto:productos(nombre)",
            )
            .in("maquina_id", ids)
            .not("producto_id", "is", null),
          // `incidencia_estado` no tiene "cerrada": sus valores son
          // abierta / en_revision / resuelta / descartada.
          sb
            .from("incidencias")
            .select("maquina_id")
            .in("maquina_id", ids)
            .in("estado", ["abierta", "en_revision"]),
          // Las quejas vivas son las que todavía pueden necesitar algo del
          // operador en sitio; las pagadas y cerradas ya no.
          sb
            .from("quejas")
            .select("maquina_id")
            .in("maquina_id", ids)
            .in("estado", [
              "abierta",
              "en_validacion",
              "espera_cliente",
              "procede",
            ]),
        ]);

  type AguaRow = {
    maquina_id: string;
    ml_estimado: number | null;
    agua_capacidad_ml: number | null;
    dias_para_vaciarse: number | null;
    sin_medicion: boolean | null;
  };
  const aguaPorMaquina = new Map<string, AguaRow>(
    ((aguaRows ?? []) as AguaRow[]).map((a) => [a.maquina_id, a]),
  );

  // Tolva corta: le cabe al menos un cartucho más. Es el mismo criterio con el
  // que se arma el surtido, para que el operador y la planeación no vean cosas
  // distintas.
  const cortasPorMaquina = new Map<string, string[]>();
  for (const t of (tolvaRows ?? []) as {
    maquina_id: string;
    numero: number;
    inventario_actual_g: number | null;
    capacidad_max_g: number | null;
    capacidad_max_g_override: number | null;
    producto: { nombre: string } | { nombre: string }[] | null;
  }[]) {
    const cap = t.capacidad_max_g_override ?? t.capacidad_max_g ?? 0;
    const actual = t.inventario_actual_g ?? 0;
    if (cap <= 0 || actual >= cap * 0.4) continue;
    const prod = Array.isArray(t.producto) ? t.producto[0] : t.producto;
    const lista = cortasPorMaquina.get(t.maquina_id) ?? [];
    lista.push(`${t.numero}. ${prod?.nombre ?? "—"}`);
    cortasPorMaquina.set(t.maquina_id, lista);
  }

  const contar = (rows: { maquina_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.maquina_id, (m.get(r.maquina_id) ?? 0) + 1);
    return m;
  };
  const incPorMaquina = contar(incRows);
  const quejasPorMaquina = contar(quejaRows);

  // Última venta por máquina: una máquina muda estando el gimnasio abierto
  // suele ser el lector de pagos, no falta de producto. Avisarlo antes de
  // llegar le da al operador la oportunidad de revisarlo en la misma visita.
  const { data: ventaRows } = await sb
    .from("ventas_maquina")
    .select("maquina_id, fecha_transaccion")
    .in("maquina_id", ids)
    .gte(
      "fecha_transaccion",
      new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    )
    .order("fecha_transaccion", { ascending: false })
    .limit(4000);

  const ultimaVentaPorMaquina = new Map<string, string>();
  for (const v of (ventaRows ?? []) as {
    maquina_id: string;
    fecha_transaccion: string;
  }[]) {
    if (!ultimaVentaPorMaquina.has(v.maquina_id)) {
      ultimaVentaPorMaquina.set(v.maquina_id, v.fecha_transaccion);
    }
  }

  // Cuánta agua hay que comprar en total hoy. Va arriba, antes de la lista:
  // es lo que el operador necesita saber ANTES de arrancar, no máquina por
  // máquina cuando ya va en el camino.
  const compras: { nombre: string; litros: number }[] = [];
  for (const am of maquinasOrdenadas) {
    const m = Array.isArray(am.maquina) ? am.maquina[0] : am.maquina;
    if (!m) continue;
    if (checkInPorMaquina.get(m.id)?.cerrado) continue;
    const a = aguaPorMaquina.get(m.id);
    const litros = litrosASugerir(
      a?.ml_estimado,
      a?.agua_capacidad_ml,
      a?.sin_medicion,
    );
    if (litros != null && (a?.dias_para_vaciarse ?? 99) <= 15) {
      compras.push({ nombre: m.alias ?? m.serie, litros });
    }
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

      {compras.length > 0 && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-sky-900">
              💧 Agua para comprar
            </div>
            <div className="text-sm font-semibold tabular-nums text-sky-900">
              {compras.reduce((s, c) => s + c.litros, 0)} L
            </div>
          </div>
          <ul className="mt-2 space-y-1">
            {compras.map((c) => (
              <li
                key={c.nombre}
                className="flex items-baseline justify-between gap-2 text-sm text-sky-900"
              >
                <span className="truncate">{c.nombre}</span>
                <span className="shrink-0 tabular-nums font-medium">
                  {c.litros} L
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-sky-800">
            Es una estimación a partir de la última medición y lo que ha
            vendido. Al llegar, revisa el tanque: si ves que necesita otra
            cosa, esa gana.
          </p>
        </div>
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

              {estado !== "completada" && (
                <EstadoMaquina
                  agua={aguaPorMaquina.get(m.id)}
                  cortas={cortasPorMaquina.get(m.id) ?? []}
                  vasos={m.vaso_inventario_actual}
                  ultimaVenta={ultimaVentaPorMaquina.get(m.id) ?? null}
                  incidencias={incPorMaquina.get(m.id) ?? 0}
                  quejas={quejasPorMaquina.get(m.id) ?? 0}
                />
              )}
            </Link>
          );
        })}
      </div>

      {asig.estado === "en_jornada" && esSuya && (
        <div className="flex justify-center pt-3">
          <CerrarIncompletaButton asignacionId={asig.id} />
        </div>
      )}
    </div>
  );
}

/**
 * El estado de una máquina antes de llegar.
 *
 * El orden importa: primero lo que obliga a desviarse en el camino (el agua,
 * que la moto solo resuelve comprando), luego lo que cambia qué tanto surtir,
 * y al final lo que hay que revisar ya estando ahí.
 *
 * Solo se pinta lo que tiene algo que decir. Una máquina sana no muestra nada
 * y la tarjeta se ve como siempre: siete renglones en verde en cada parada son
 * ruido, y el ruido se deja de leer.
 */
function EstadoMaquina({
  agua,
  cortas,
  vasos,
  ultimaVenta,
  incidencias,
  quejas,
}: {
  agua?: {
    ml_estimado: number | null;
    agua_capacidad_ml: number | null;
    dias_para_vaciarse: number | null;
    sin_medicion: boolean | null;
  };
  cortas: string[];
  vasos: number | null;
  ultimaVenta: string | null;
  incidencias: number;
  quejas: number;
}) {
  const litros = litrosASugerir(
    agua?.ml_estimado,
    agua?.agua_capacidad_ml,
    agua?.sin_medicion,
  );
  const dias = agua?.dias_para_vaciarse ?? null;
  const aguaUrge = litros != null && dias != null && dias <= 15;
  const pct =
    agua?.ml_estimado != null && agua?.agua_capacidad_ml
      ? Math.round((agua.ml_estimado / agua.agua_capacidad_ml) * 100)
      : null;

  const horasSinVender = ultimaVenta
    ? (Date.now() - new Date(ultimaVenta).getTime()) / 3_600_000
    : null;
  // 12 h es el mismo umbral de la alerta de máquina muda: que el operador y
  // el tablero no vean cosas distintas.
  const muda = horasSinVender == null || horasSinVender > 12;

  const vasosBajos = vasos != null && vasos > 0 && vasos < 50;
  const hayAlgo =
    aguaUrge ||
    agua?.sin_medicion ||
    cortas.length > 0 ||
    vasosBajos ||
    muda ||
    incidencias > 0 ||
    quejas > 0;
  if (!hayAlgo) return null;

  return (
    <div className="mt-2 space-y-1 border-t border-zinc-100 pt-2 text-xs">
      {aguaUrge && (
        <div className="flex items-baseline gap-1.5 font-medium text-sky-800">
          <span>💧</span>
          <span>
            Compra {litros} L — va en {mlALitros(agua?.ml_estimado)}
            {pct != null && ` (${pct}%)`}
            {dias != null && `, le quedan ${dias} días`}
          </span>
        </div>
      )}

      {agua?.sin_medicion && (
        <div className="flex items-baseline gap-1.5 text-sky-800">
          <span>💧</span>
          <span>Nunca se le ha medido el agua — mídela al llegar</span>
        </div>
      )}

      {cortas.length > 0 && (
        <div className="flex items-baseline gap-1.5 text-amber-800">
          <span>▾</span>
          <span>
            {cortas.length} tolva{cortas.length === 1 ? "" : "s"} corta
            {cortas.length === 1 ? "" : "s"}: {cortas.join(" · ")}
          </span>
        </div>
      )}

      {vasosBajos && (
        <div className="flex items-baseline gap-1.5 text-amber-800">
          <span>▾</span>
          <span>Quedan {vasos} vasos</span>
        </div>
      )}

      {muda && (
        <div className="flex items-baseline gap-1.5 text-red-700">
          <span>⚠</span>
          <span>
            {horasSinVender == null
              ? "Sin ventas en la última semana"
              : `Sin vender hace ${Math.round(horasSinVender)} h`}{" "}
            — revisa el lector de pagos
          </span>
        </div>
      )}

      {(incidencias > 0 || quejas > 0) && (
        <div className="flex items-baseline gap-1.5 text-zinc-600">
          <span>•</span>
          <span>
            {incidencias > 0 &&
              `${incidencias} incidencia${incidencias === 1 ? "" : "s"} abierta${incidencias === 1 ? "" : "s"}`}
            {incidencias > 0 && quejas > 0 && " · "}
            {quejas > 0 &&
              `${quejas} queja${quejas === 1 ? "" : "s"} de usuario`}
          </span>
        </div>
      )}
    </div>
  );
}
