import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Detalle jornada · MuscleUp" };

const ESTADO_BADGE: Record<string, string> = {
  planeada: "bg-zinc-100 text-zinc-600",
  surtida: "bg-blue-100 text-blue-700",
  en_jornada: "bg-amber-100 text-amber-700",
  completada: "bg-green-100 text-green-700",
  cancelada: "bg-red-100 text-red-700",
};

function fmtSegundos(s: number | null) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return `${m}m ${sec}s`;
}

async function signedUrlFromKey(
  supabase: ReturnType<typeof createClient>,
  key: string | null,
): Promise<string | null> {
  if (!key) return null;
  const [bucket, ...rest] = key.split("/");
  const path = rest.join("/");
  if (!bucket || !path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export default async function JornadaDetallePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const { data: jornada } = await supabase
    .from("jornadas")
    .select(
      `id, hora_inicio, lat_inicio, lng_inicio, hora_ultima_actividad,
       asignacion:asignaciones_diarias!jornadas_asignacion_id_fkey(
         id, fecha, estado,
         ruta:rutas(nombre, color_hex)
       ),
       operador:profiles!jornadas_operador_id_fkey(full_name)`,
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!jornada) notFound();

  const asig = Array.isArray(jornada.asignacion)
    ? jornada.asignacion[0]
    : jornada.asignacion;
  const ruta = asig
    ? Array.isArray(asig.ruta)
      ? asig.ruta[0]
      : asig.ruta
    : null;
  const op = Array.isArray(jornada.operador)
    ? jornada.operador[0]
    : jornada.operador;

  // Check-ins de la asignación
  const { data: checkIns } = await supabase
    .from("check_ins")
    .select(
      `id, fecha_entrada, fecha_salida, tiempo_en_sitio_seg,
       lat, lng, precision_m, metodo, foto_evidencia_url, notas,
       maquina:maquinas(
         id, serie, alias,
         ubicacion:ubicaciones(nombre, cliente:clientes(nombre))
       ),
       llenado:llenados(
         id, fecha, evidencia_url, notas,
         items:llenado_items(
           id, tolva_id, cartuchos_planeados, cartuchos_cargados,
           gramos_cargados, encartuchado_id,
           producto:encartuchados!llenado_items_encartuchado_id_fkey(
             producto:productos(sku, nombre)
           )
         )
       ),
       incidencias:incidencias!incidencias_check_in_id_fkey(
         id, folio, tipo, severidad, descripcion, estado, foto_url
       )`,
    )
    .eq("asignacion_id", asig?.id ?? "")
    .order("fecha_entrada");

  // Devoluciones de la jornada (via llenado_items.devoluciones_almacen)
  const llenadoItemIds: string[] = [];
  for (const ci of checkIns ?? []) {
    const lle = Array.isArray(ci.llenado) ? ci.llenado[0] : ci.llenado;
    const items = lle && Array.isArray(lle.items) ? lle.items : [];
    for (const li of items) llenadoItemIds.push(li.id);
  }

  const { data: devoluciones } =
    llenadoItemIds.length > 0
      ? await supabase
          .from("devoluciones_almacen")
          .select(
            `id, llenado_item_id, cantidad_calculada, cantidad_recibida_almacen,
             estado, fecha_recepcion,
             incidencia:incidencias!devoluciones_almacen_incidencia_id_fkey(folio)`,
          )
          .in("llenado_item_id", llenadoItemIds)
      : { data: [] };

  const devoluPorItem = new Map<
    string,
    NonNullable<typeof devoluciones>[number]
  >();
  for (const d of devoluciones ?? []) {
    devoluPorItem.set(d.llenado_item_id, d);
  }

  // Pesajes hechos por el operador en esta jornada (por check_in)
  const checkInIds = (checkIns ?? []).map((ci) => ci.id);
  const { data: pesajes } =
    checkInIds.length > 0
      ? await supabase
          .from("pesajes_maquina")
          .select(
            `id, check_in_id, fecha, notas,
             items:pesaje_tolva_items(
               id, tolva_id, gramos_medidos, gramos_teoricos,
               diferencia_gramos, diferencia_porcentaje,
               valor_diferencia, alerta_generada
             )`,
          )
          .in("check_in_id", checkInIds)
      : { data: [] };

  const pesajePorCheckIn = new Map<
    string,
    NonNullable<typeof pesajes>[number]
  >();
  for (const p of pesajes ?? []) pesajePorCheckIn.set(p.check_in_id, p);

  // Tolvas para mapear numero (incluye tolvas de pesajes)
  const tolvaIds: string[] = [];
  for (const ci of checkIns ?? []) {
    const lle = Array.isArray(ci.llenado) ? ci.llenado[0] : ci.llenado;
    const items = lle && Array.isArray(lle.items) ? lle.items : [];
    for (const li of items) tolvaIds.push(li.tolva_id);
  }
  for (const p of pesajes ?? []) {
    const items = Array.isArray(p.items) ? p.items : [];
    for (const it of items) tolvaIds.push(it.tolva_id);
  }
  const { data: tolvas } =
    tolvaIds.length > 0
      ? await supabase
          .from("tolvas")
          .select("id, numero")
          .in("id", tolvaIds)
      : { data: [] };
  const tolvaNumeroById = new Map<string, number>();
  for (const t of tolvas ?? []) tolvaNumeroById.set(t.id, t.numero);

  // Totales
  let totalCartuchos = 0;
  let totalGramos = 0;
  let totalIncidencias = 0;
  let totalDevPendientes = 0;
  for (const ci of checkIns ?? []) {
    const lle = Array.isArray(ci.llenado) ? ci.llenado[0] : ci.llenado;
    const items = lle && Array.isArray(lle.items) ? lle.items : [];
    for (const li of items) {
      totalCartuchos += li.cartuchos_cargados ?? 0;
      totalGramos += li.gramos_cargados ?? 0;
      const dev = devoluPorItem.get(li.id);
      if (dev && dev.estado === "pendiente_devolucion") totalDevPendientes += 1;
    }
    const incs = Array.isArray(ci.incidencias) ? ci.incidencias : [];
    totalIncidencias += incs.length;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/jornadas"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Jornadas
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div
            className="h-10 w-1.5 rounded-sm"
            style={{ backgroundColor: ruta?.color_hex ?? "#a1a1aa" }}
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {ruta?.nombre ?? "Ruta"} · {asig?.fecha}
            </h1>
            <p className="text-sm text-zinc-600">
              {op?.full_name ?? "—"} · inicio{" "}
              {fmtCDMX(jornada.hora_inicio, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <span
            className={`ml-auto inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              ESTADO_BADGE[asig?.estado ?? ""] ?? "bg-zinc-100"
            }`}
          >
            {asig?.estado}
          </span>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Máquinas" value={String((checkIns ?? []).length)} />
        <Stat label="Cartuchos" value={String(totalCartuchos)} />
        <Stat label="Gramos" value={`${totalGramos.toLocaleString("es-MX")}g`} />
        <Stat label="Incidencias" value={String(totalIncidencias)} />
        <Stat
          label="Dev. pendientes"
          value={String(totalDevPendientes)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Visitas en orden
        </h2>

        {(checkIns ?? []).length === 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
            No hay check-ins registrados todavía.
          </div>
        )}

        {await Promise.all(
          (checkIns ?? []).map(async (ci, idx) => {
            const m = Array.isArray(ci.maquina) ? ci.maquina[0] : ci.maquina;
            const ubic = m
              ? Array.isArray(m.ubicacion)
                ? m.ubicacion[0]
                : m.ubicacion
              : null;
            const cliente = ubic
              ? Array.isArray(ubic.cliente)
                ? ubic.cliente[0]
                : ubic.cliente
              : null;
            const lle = Array.isArray(ci.llenado) ? ci.llenado[0] : ci.llenado;
            const items = lle && Array.isArray(lle.items) ? lle.items : [];
            const incs = Array.isArray(ci.incidencias) ? ci.incidencias : [];
            const pesaje = pesajePorCheckIn.get(ci.id);
            const pesajeItems =
              pesaje && Array.isArray(pesaje.items) ? pesaje.items : [];
            const hayDevoluciones = items.some((li: { id: string }) =>
              devoluPorItem.has(li.id),
            );

            const fotoCheckIn = await signedUrlFromKey(
              supabase,
              ci.foto_evidencia_url,
            );
            const fotoLlenado = await signedUrlFromKey(
              supabase,
              lle?.evidencia_url ?? null,
            );

            const mapsUrl =
              ci.lat && ci.lng
                ? `https://www.google.com/maps?q=${ci.lat},${ci.lng}`
                : null;

            return (
              <article
                key={ci.id}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
              >
                <header className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <div className="font-mono text-sm font-semibold">
                        #{idx + 1} · {m?.serie ?? "—"}
                      </div>
                      {m?.alias && (
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
                    <div className="text-right text-xs">
                      <div>
                        <span className="text-zinc-500">Entrada </span>
                        <span className="font-medium">
                          {fmtCDMX(ci.fecha_entrada, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {ci.fecha_salida && (
                        <div>
                          <span className="text-zinc-500">Salida </span>
                          <span className="font-medium">
                            {fmtCDMX(ci.fecha_salida, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="ml-1 text-zinc-500">
                            ({fmtSegundos(ci.tiempo_en_sitio_seg)})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-600">
                    <span>
                      <span className="text-zinc-400">Método:</span> {ci.metodo}
                    </span>
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 underline"
                      >
                        Ver ubicación en Maps
                        {ci.precision_m && (
                          <span className="ml-1 text-zinc-500">
                            (±{Math.round(Number(ci.precision_m))}m)
                          </span>
                        )}
                      </a>
                    )}
                  </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3">
                  {(fotoCheckIn || fotoLlenado) && (
                    <div className="border-r border-zinc-100 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Evidencia
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {fotoCheckIn && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a href={fotoCheckIn} target="_blank" rel="noreferrer">
                            <img
                              src={fotoCheckIn}
                              alt="Check-in"
                              className="aspect-square w-full rounded-md border border-zinc-200 object-cover"
                            />
                            <span className="mt-1 block text-[10px] text-zinc-500">
                              Check-in
                            </span>
                          </a>
                        )}
                        {fotoLlenado && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a href={fotoLlenado} target="_blank" rel="noreferrer">
                            <img
                              src={fotoLlenado}
                              alt="Llenado"
                              className="aspect-square w-full rounded-md border border-zinc-200 object-cover"
                            />
                            <span className="mt-1 block text-[10px] text-zinc-500">
                              Llenado
                            </span>
                          </a>
                        )}
                      </div>
                      {ci.notas && (
                        <p className="mt-2 text-xs italic text-zinc-600">
                          “{ci.notas}”
                        </p>
                      )}
                    </div>
                  )}

                  <div
                    className={
                      fotoCheckIn || fotoLlenado
                        ? "p-3 md:col-span-2"
                        : "p-3 md:col-span-3"
                    }
                  >
                    {items.length > 0 ? (
                      <table className="w-full text-xs">
                        <thead className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                          <tr>
                            <th className="py-1 font-medium">Tolva</th>
                            <th className="py-1 font-medium">Producto</th>
                            <th className="py-1 text-right font-medium">Plan</th>
                            <th className="py-1 text-right font-medium">Carg</th>
                            <th className="py-1 text-right font-medium">Gramos</th>
                            {hayDevoluciones && (
                              <th className="py-1 text-right font-medium">
                                Cart. devueltos
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {items.map((li: {
                            id: string;
                            tolva_id: string;
                            cartuchos_planeados: number;
                            cartuchos_cargados: number;
                            gramos_cargados: number;
                            producto: {
                              producto: { sku: string; nombre: string } | { sku: string; nombre: string }[] | null;
                            } | { producto: { sku: string; nombre: string } | { sku: string; nombre: string }[] | null }[] | null;
                          }) => {
                            const enc = Array.isArray(li.producto)
                              ? li.producto[0]
                              : li.producto;
                            const prod = enc
                              ? Array.isArray(enc.producto)
                                ? enc.producto[0]
                                : enc.producto
                              : null;
                            const dev = devoluPorItem.get(li.id);
                            return (
                              <tr key={li.id}>
                                <td className="py-1 font-mono">
                                  #{tolvaNumeroById.get(li.tolva_id) ?? "?"}
                                </td>
                                <td className="py-1">
                                  <div className="font-medium">
                                    {prod?.nombre ?? "—"}
                                  </div>
                                  <div className="font-mono text-[10px] text-zinc-500">
                                    {prod?.sku ?? ""}
                                  </div>
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {li.cartuchos_planeados}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {li.cartuchos_cargados}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {li.gramos_cargados}g
                                </td>
                                {hayDevoluciones && (
                                  <td className="py-1 text-right text-xs">
                                    {dev ? (
                                      <span
                                        className={
                                          dev.estado === "pendiente_devolucion"
                                            ? "text-amber-700"
                                            : dev.estado === "recibida_ok"
                                              ? "text-green-700"
                                              : "text-red-700"
                                        }
                                      >
                                        {dev.cantidad_calculada} cart{" "}
                                        {dev.estado === "pendiente_devolucion"
                                          ? "pend."
                                          : `↪ ${dev.cantidad_recibida_almacen ?? "?"}`}
                                      </span>
                                    ) : (
                                      <span className="text-zinc-300">—</span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-xs text-zinc-500">
                        Sin llenado registrado.
                      </p>
                    )}

                    {pesaje && pesajeItems.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-baseline justify-between">
                          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            Pesaje del operador ·{" "}
                            {fmtCDMX(pesaje.fecha, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                          <Link
                            href={`/admin/pesajes/${pesaje.id}`}
                            className="text-[11px] text-blue-700 hover:underline"
                          >
                            Editar →
                          </Link>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
                            <tr>
                              <th className="py-1 font-medium">Tolva</th>
                              <th className="py-1 text-right font-medium">
                                Teórico
                              </th>
                              <th className="py-1 text-right font-medium">
                                Medido
                              </th>
                              <th className="py-1 text-right font-medium">
                                Δ g
                              </th>
                              <th className="py-1 text-right font-medium">
                                Δ %
                              </th>
                              <th className="py-1 text-right font-medium">
                                Valor
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {pesajeItems.map((pi) => {
                              const diff = pi.diferencia_gramos ?? 0;
                              const cls =
                                diff === 0
                                  ? "text-zinc-700"
                                  : diff < 0
                                    ? "text-red-700"
                                    : "text-green-700";
                              return (
                                <tr key={pi.id}>
                                  <td className="py-1 font-mono">
                                    #{tolvaNumeroById.get(pi.tolva_id) ?? "?"}
                                  </td>
                                  <td className="py-1 text-right tabular-nums">
                                    {pi.gramos_teoricos}g
                                  </td>
                                  <td className="py-1 text-right tabular-nums">
                                    {pi.gramos_medidos}g
                                  </td>
                                  <td
                                    className={`py-1 text-right tabular-nums ${cls}`}
                                  >
                                    {diff > 0 ? "+" : ""}
                                    {diff}g
                                  </td>
                                  <td
                                    className={`py-1 text-right tabular-nums ${cls}`}
                                  >
                                    {pi.diferencia_porcentaje != null
                                      ? `${pi.diferencia_porcentaje}%`
                                      : "—"}
                                  </td>
                                  <td
                                    className={`py-1 text-right tabular-nums ${cls}`}
                                  >
                                    {pi.valor_diferencia != null
                                      ? `$${Number(pi.valor_diferencia).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {pesaje.notas && (
                          <p className="mt-1 text-[11px] italic text-zinc-600">
                            “{pesaje.notas}”
                          </p>
                        )}
                      </div>
                    )}

                    {incs.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          Incidencias
                        </div>
                        {incs.map(
                          (inc: {
                            id: string;
                            folio: string;
                            tipo: string;
                            severidad: string;
                            descripcion: string;
                            estado: string;
                          }) => (
                            <Link
                              key={inc.id}
                              href={`/admin/incidencias/${inc.id}`}
                              className="block rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs hover:bg-amber-100"
                            >
                              <span className="font-mono">{inc.folio}</span>
                              <span className="ml-2">
                                {inc.tipo.replace(/_/g, " ")} ·{" "}
                                {inc.severidad}
                              </span>
                              <span className="ml-2 text-zinc-500">
                                ({inc.estado})
                              </span>
                              <p className="mt-0.5 text-[11px] text-zinc-700">
                                {inc.descripcion}
                              </p>
                            </Link>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          }),
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
        {value}
      </div>
    </div>
  );
}
