import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import CheckInForm from "./CheckInForm";
import IncidenciaForm from "./IncidenciaForm";
import LlenadoForm from "./LlenadoForm";

export default async function MaquinaCampoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { asignacion?: string; error?: string; ok?: string };
}) {
  const user = await requireRole("operador", "admin", "direccion");
  const supabase = createClient();

  const asignacionId = searchParams.asignacion ?? "";
  if (!asignacionId) {
    redirect("/campo");
  }

  // Verifica asignación
  const { data: asig } = await supabase
    .from("asignaciones_diarias")
    .select(
      `id, operador_id, estado,
       jornada:jornadas(id),
       ruta:rutas(nombre, color_hex)`,
    )
    .eq("id", asignacionId)
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

  const jornada = Array.isArray(asig.jornada) ? asig.jornada[0] : asig.jornada;
  if (!jornada) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Primero inicia la jornada.{" "}
        <Link
          href={`/campo/jornada/${asignacionId}`}
          className="font-medium underline"
        >
          Ir a la jornada
        </Link>
      </div>
    );
  }

  // Máquina + tolvas
  const { data: maquina } = await supabase
    .from("maquinas")
    .select(
      `id, serie, alias,
       ubicacion:ubicaciones(nombre, cliente:clientes(nombre)),
       tolvas:tolvas(
         id, numero, producto_id, gramaje_servicio,
         inventario_actual_g, capacidad_max_g,
         producto:productos(sku, nombre)
       )`,
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!maquina) notFound();

  const ubic = Array.isArray(maquina.ubicacion)
    ? maquina.ubicacion[0]
    : maquina.ubicacion;
  const cliente = ubic
    ? Array.isArray(ubic.cliente)
      ? ubic.cliente[0]
      : ubic.cliente
    : null;

  const tolvas = (maquina.tolvas ?? []).slice().sort((a, b) => a.numero - b.numero);

  // Surtido de la asignación
  const { data: surtido } = await supabase
    .from("surtidos")
    .select("id, estado")
    .eq("asignacion_id", asignacionId)
    .maybeSingle();

  const { data: surtidoItems } = surtido
    ? await supabase
        .from("surtido_items")
        .select(
          `id, producto_id, cartuchos_entregados, encartuchado_id,
           producto:productos(sku, nombre, tipo)`,
        )
        .eq("surtido_id", surtido.id)
        .eq("maquina_id", maquina.id)
        .gt("cartuchos_entregados", 0)
    : { data: [] };

  // Check-in existente
  const { data: checkIn } = await supabase
    .from("check_ins")
    .select(
      `id, fecha_entrada, fecha_salida, lat, lng, metodo, foto_evidencia_url,
       llenado:llenados(
         id, fecha,
         items:llenado_items(
           id, tolva_id, cartuchos_planeados, cartuchos_cargados,
           gramos_cargados
         )
       )`,
    )
    .eq("asignacion_id", asignacionId)
    .eq("maquina_id", params.id)
    .maybeSingle();

  const llenado = checkIn
    ? Array.isArray(checkIn.llenado)
      ? checkIn.llenado[0]
      : checkIn.llenado
    : null;

  // Incidencias del check-in
  const { data: incidencias } = checkIn
    ? await supabase
        .from("incidencias")
        .select("id, folio, tipo, severidad, descripcion, estado")
        .eq("check_in_id", checkIn.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const tieneCheckIn = !!checkIn;
  const visitaCerrada = !!checkIn?.fecha_salida || !!llenado;

  // Solo tolvas con producto polvo asignado (donde se puede llenar)
  const tolvasPolvo = tolvas.filter((t) => t.producto_id !== null);
  type TolvaInfo = (typeof tolvasPolvo)[number];

  // Surtido items con info derivada (qué tolvas son candidatas para cada producto)
  const surtidoItemsInfo = (surtidoItems ?? []).map((si) => {
    const tolvasCandidatas = tolvasPolvo.filter(
      (t: TolvaInfo) => t.producto_id === si.producto_id,
    );
    const prod = Array.isArray(si.producto) ? si.producto[0] : si.producto;
    return {
      id: si.id,
      producto_id: si.producto_id,
      cartuchos_entregados: si.cartuchos_entregados,
      encartuchado_id: si.encartuchado_id,
      producto: prod,
      tolvas_candidatas: tolvasCandidatas.map((t: TolvaInfo) => ({
        id: t.id,
        numero: t.numero,
        gramaje_servicio: t.gramaje_servicio,
      })),
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/campo/jornada/${asignacionId}`}
          className="text-sm text-zinc-600 active:text-zinc-900"
        >
          ← Máquinas
        </Link>
        <div className="mt-2">
          <div className="font-mono text-base font-semibold tracking-tight">
            {maquina.serie}
          </div>
          {maquina.alias && (
            <div className="text-sm text-zinc-700">{maquina.alias}</div>
          )}
          {(cliente || ubic) && (
            <div className="text-xs text-zinc-500">
              {cliente?.nombre ?? ""}
              {cliente && ubic ? " · " : ""}
              {ubic?.nombre ?? ""}
            </div>
          )}
        </div>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(searchParams.error)}
        </p>
      )}
      {searchParams.ok && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {decodeURIComponent(searchParams.ok)}
        </p>
      )}

      {!tieneCheckIn && (
        <CheckInForm
          asignacionId={asignacionId}
          maquinaId={maquina.id}
          serie={maquina.serie}
        />
      )}

      {tieneCheckIn && !visitaCerrada && (
        <>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Check-in
            </div>
            <div className="mt-1 text-sm text-zinc-900">
              {new Date(checkIn.fecha_entrada).toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {checkIn.lat && checkIn.lng && (
                <span className="ml-2 text-xs text-zinc-500">
                  GPS {checkIn.lat.toFixed(5)}, {checkIn.lng.toFixed(5)}
                </span>
              )}
            </div>
          </div>

          {surtidoItemsInfo.length > 0 ? (
            <LlenadoForm
              checkInId={checkIn.id}
              maquinaId={maquina.id}
              asignacionId={asignacionId}
              items={surtidoItemsInfo}
            />
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
              No hay surtido planeado para esta máquina. Si solo vienes a
              inspección o a reportar algo, usa &laquo;Reportar incidencia&raquo;.
            </div>
          )}

          <IncidenciaForm
            checkInId={checkIn.id}
            maquinaId={maquina.id}
            asignacionId={asignacionId}
          />

          {incidencias && incidencias.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Incidencias reportadas
              </div>
              {incidencias.map((i) => (
                <div
                  key={i.id}
                  className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{i.folio}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs">
                      {i.tipo}
                    </span>
                    <span className="text-xs text-amber-800">{i.severidad}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-700">{i.descripcion}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {visitaCerrada && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="text-sm font-medium text-green-900">
              Visita completada
            </div>
            {checkIn?.fecha_salida && (
              <div className="mt-1 text-xs text-green-800">
                Cerrada a las{" "}
                {new Date(checkIn.fecha_salida).toLocaleTimeString("es-MX", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>

          {llenado?.items && llenado.items.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white">
              <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
                Llenado
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="px-3 py-1 font-medium">Tolva</th>
                    <th className="px-3 py-1 text-right font-medium">
                      Planeado
                    </th>
                    <th className="px-3 py-1 text-right font-medium">
                      Cargado
                    </th>
                    <th className="px-3 py-1 text-right font-medium">
                      Gramos
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {llenado.items.map((li: {
                    id: string;
                    tolva_id: string;
                    cartuchos_planeados: number;
                    cartuchos_cargados: number;
                    gramos_cargados: number;
                  }) => {
                    const tol = tolvas.find((t) => t.id === li.tolva_id);
                    return (
                      <tr key={li.id}>
                        <td className="px-3 py-1 font-mono">
                          #{tol?.numero ?? "?"}
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          {li.cartuchos_planeados}
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          {li.cartuchos_cargados}
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          {li.gramos_cargados}g
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
