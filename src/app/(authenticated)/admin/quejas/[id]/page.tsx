import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import {
  autorizarMonto,
  cerrarQueja,
  registrarContacto,
  registrarPago,
  registrarRecuperacion,
  validarQueja,
} from "../actions";

export const metadata = { title: "Queja · Innovaypunto" };

const TIPO_LABEL: Record<string, string> = {
  cobro_sin_producto: "Cobró y no salió producto",
  cobro_duplicado: "Cobro duplicado",
  maquina_da_agua: "Máquina da agua",
  bebida_incompleta: "Bebida incompleta",
  vaso_vacio: "Vaso vacío",
  vaso_atorado: "Vaso atorado",
  vaso_atrapado_puerta: "Vaso atrapado en la puerta",
  producto_mal_estado: "Producto en mal estado",
  mal_olor: "Mal olor",
  terminal_no_pasa: "Terminal no pasa",
  touchscreen_no_sirve: "Touchscreen no sirve",
  maquina_en_error: "Máquina en error",
  otro: "Otro",
};

const RESULTADO_LABEL: Record<string, string> = {
  contesto: "Contestó",
  no_contesto: "No contestó",
  pendiente_info: "Falta que mande algo",
};

const ERRORES: Record<string, string> = {
  motivo_requerido: "Si la queja no procede, escribe por qué.",
  monto_invalido: "El monto autorizado no es válido.",
  comprobante_requerido: "Sube el comprobante antes de marcar la queja pagada.",
  sin_toques:
    "No puedes cerrar por falta de respuesta sin haber registrado al menos un intento de contacto. Esa bitácora es la evidencia.",
  pago: "No se pudo registrar el pago.",
};

const CERRADAS = ["cerrada_resuelta", "cerrada_sin_respuesta"];

export default async function QuejaDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  await requireRole("admin", "direccion", "planeador");
  const supabase = createClient();

  const { data: q } = await supabase
    .from("quejas")
    .select(
      `id, folio, fecha_reporte, telefono_ultimos4, tipo, descripcion, estado,
       monto_reclamado, monto_autorizado, procede, motivo_no_procede,
       fecha_validacion, fecha_pago, comprobante_url, recuperado,
       fecha_entrega_dinero, fecha_cierre, notas_cierre,
       maquina:maquinas(id, serie, alias, ubicacion:ubicaciones(nombre)),
       operador:profiles!quejas_operador_id_fkey(full_name),
       validador:profiles!quejas_validada_por_fkey(full_name)`,
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!q) notFound();

  const { data: toques } = await supabase
    .from("queja_contactos")
    .select(
      "id, fecha, canal, resultado, nota, registrado_por:profiles(full_name)",
    )
    .eq("queja_id", params.id)
    .order("fecha", { ascending: false });

  const maq = Array.isArray(q.maquina) ? q.maquina[0] : q.maquina;
  const ubic = maq
    ? Array.isArray(maq.ubicacion)
      ? maq.ubicacion[0]
      : maq.ubicacion
    : null;
  const operador = Array.isArray(q.operador) ? q.operador[0] : q.operador;
  const cerrada = CERRADAS.includes(q.estado);
  const dias = Math.floor(
    (Date.now() - new Date(q.fecha_reporte).getTime()) / 86_400_000,
  );

  // Reincidencia de este WhatsApp: se busca por los últimos 4 y se afina con la
  // máquina, porque el hash no se expone a la pantalla.
  const { count: previas } = await supabase
    .from("quejas")
    .select("id", { count: "exact", head: true })
    .eq("telefono_ultimos4", q.telefono_ultimos4)
    .neq("id", q.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/quejas" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Quejas
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {q.folio}
          </h1>
          {!cerrada && dias >= 3 && (
            <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {dias} días abierta
            </span>
          )}
          {cerrada && (
            <span className="inline-flex rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600">
              {q.estado === "cerrada_sin_respuesta"
                ? "Cerrada sin respuesta"
                : "Cerrada"}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          {fmtCDMX(q.fecha_reporte, {
            day: "2-digit",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {ERRORES[searchParams.error] ?? "Algo salió mal."}
        </p>
      )}

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Dato label="WhatsApp" valor={`···${q.telefono_ultimos4}`} />
        <Dato
          label="Máquina"
          valor={maq ? `${maq.serie} · ${maq.alias ?? ""}` : "—"}
          nota={ubic?.nombre ?? undefined}
        />
        <Dato label="Tipo" valor={TIPO_LABEL[q.tipo] ?? q.tipo} />
        <Dato label="Operador" valor={operador?.full_name ?? "sin asignar"} />
      </section>

      {(previas ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Este WhatsApp tiene {previas} queja{previas === 1 ? "" : "s"} previa
            {previas === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Revísalo antes de autorizar. Repetir en la misma máquina suele ser
            una máquina descompuesta; repetir en varias es otra cosa.{" "}
            <Link href="/admin/quejas/reincidencia" className="underline">
              Ver reincidencia
            </Link>
          </p>
        </div>
      )}

      {q.descripcion && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Qué pasó
          </div>
          <p className="mt-1 text-sm text-zinc-800">{q.descripcion}</p>
        </div>
      )}

      {/* ── Validación ───────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Validación</h2>
        {q.procede === null ? (
          <form action={validarQueja} className="mt-3 space-y-3">
            <input type="hidden" name="queja_id" value={q.id} />
            <input
              name="motivo_no_procede"
              placeholder="Si no procede, ¿por qué?"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                name="procede"
                value="true"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Procede
              </button>
              <button
                type="submit"
                name="procede"
                value="false"
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                No procede
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-2 text-sm text-zinc-700">
            {q.procede ? "Procede" : `No procede — ${q.motivo_no_procede}`}
            {q.fecha_validacion && (
              <span className="text-zinc-500">
                {" "}
                · {fmtCDMX(q.fecha_validacion, { day: "2-digit", month: "short" })}
              </span>
            )}
          </p>
        )}
      </section>

      {/* ── Dinero ───────────────────────────────────────────────────────── */}
      {q.procede && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Reembolso</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Reclamado:{" "}
            {q.monto_reclamado != null
              ? `$${Number(q.monto_reclamado).toFixed(2)}`
              : "no dijo"}
          </p>

          {q.monto_autorizado == null ? (
            <form action={autorizarMonto} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="queja_id" value={q.id} />
              <input
                name="monto_autorizado"
                type="number"
                step="0.01"
                min={0}
                required
                placeholder="Monto a pagar"
                className="w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Autorizar
              </button>
            </form>
          ) : (
            <p className="mt-2 text-lg font-semibold tabular-nums">
              ${Number(q.monto_autorizado).toFixed(2)}
            </p>
          )}

          {q.monto_autorizado != null && q.estado !== "pagada" && !cerrada && (
            <form action={registrarPago} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="queja_id" value={q.id} />
              <input
                name="comprobante_url"
                required
                placeholder="Ruta del comprobante de transferencia"
                className="min-w-64 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
              >
                Marcar pagada
              </button>
            </form>
          )}

          {q.fecha_pago && (
            <p className="mt-2 text-sm text-green-700">
              Pagada el{" "}
              {fmtCDMX(q.fecha_pago, { day: "2-digit", month: "long" })}
            </p>
          )}

          {q.fecha_pago && !q.recuperado && (
            <form action={registrarRecuperacion} className="mt-3">
              <input type="hidden" name="queja_id" value={q.id} />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                El operador ya entregó el dinero recuperado
              </button>
            </form>
          )}
          {q.recuperado && (
            <p className="mt-2 text-xs text-zinc-600">
              Dinero recuperado de la máquina
              {q.fecha_entrega_dinero
                ? ` · entregado el ${fmtCDMX(q.fecha_entrega_dinero, { day: "2-digit", month: "short" })}`
                : ""}
            </p>
          )}
        </section>
      )}

      {/* ── Bitácora de toques ───────────────────────────────────────────── */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">
            Toques al usuario
          </h2>
          <span className="text-xs text-zinc-500">
            {(toques ?? []).length} registrados · día 1, 2 y 3, y uno final a la
            semana
          </span>
        </div>

        {!cerrada && (
          <form action={registrarContacto} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="queja_id" value={q.id} />
            <select
              name="canal"
              defaultValue="whatsapp"
              className="rounded-md border border-zinc-300 px-2 py-2 text-sm"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="llamada">Llamada</option>
              <option value="correo">Correo</option>
              <option value="presencial">Presencial</option>
            </select>
            <select
              name="resultado"
              required
              defaultValue=""
              className="rounded-md border border-zinc-300 px-2 py-2 text-sm"
            >
              <option value="" disabled>
                ¿Qué pasó?
              </option>
              <option value="contesto">Contestó</option>
              <option value="no_contesto">No contestó</option>
              <option value="pendiente_info">Falta que mande algo</option>
            </select>
            <input
              name="nota"
              placeholder="Nota (opcional)"
              className="min-w-48 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Registrar toque
            </button>
          </form>
        )}

        <ul className="mt-4 space-y-2">
          {(toques ?? []).map((t) => {
            const quien = Array.isArray(t.registrado_por)
              ? t.registrado_por[0]
              : t.registrado_por;
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-baseline gap-2 border-l-2 border-zinc-200 py-1 pl-3 text-sm"
              >
                <span className="font-medium text-zinc-800">
                  {RESULTADO_LABEL[t.resultado] ?? t.resultado}
                </span>
                <span className="text-xs text-zinc-500">
                  {t.canal} ·{" "}
                  {fmtCDMX(t.fecha, {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {quien?.full_name ? ` · ${quien.full_name}` : ""}
                </span>
                {t.nota && <span className="w-full text-xs text-zinc-600">{t.nota}</span>}
              </li>
            );
          })}
          {(toques ?? []).length === 0 && (
            <li className="py-2 text-sm text-zinc-500">
              Sin toques registrados todavía.
            </li>
          )}
        </ul>
      </section>

      {/* ── Cierre ───────────────────────────────────────────────────────── */}
      {!cerrada && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Cerrar queja</h2>
          <form action={cerrarQueja} className="mt-3 space-y-2">
            <input type="hidden" name="queja_id" value={q.id} />
            <input
              name="notas_cierre"
              placeholder="Notas de cierre (opcional)"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="motivo"
                value="resuelta"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Cerrar como resuelta
              </button>
              <button
                type="submit"
                name="motivo"
                value="sin_respuesta"
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cerrar por falta de respuesta
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Cerrar por falta de respuesta exige al menos un toque registrado:
              esa bitácora es la evidencia ante el cliente y ante dirección.
            </p>
          </form>
        </section>
      )}

      {cerrada && q.notas_cierre && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          {q.notas_cierre}
        </div>
      )}
    </div>
  );
}

function Dato({
  label,
  valor,
  nota,
}: {
  label: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-zinc-900">{valor}</div>
      {nota && <div className="text-xs text-zinc-500">{nota}</div>}
    </div>
  );
}
