import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import { EditarPesajeForm } from "./EditarPesajeForm";

export const metadata = { title: "Editar pesaje · MuscleUp" };

export default async function EditarPesajePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion");
  const supabase = createClient();

  const { data: pesaje } = await supabase
    .from("pesajes_maquina")
    .select(
      `id, fecha, notas, check_in_id,
       vasos_teoricos, vasos_medidos, vasos_costo_unitario,
       vasos_valor_diferencia,
       maquina:maquinas(
         serie, alias, vaso_producto_id,
         vaso_producto:productos!maquinas_vaso_producto_id_fkey(sku, nombre)
       ),
       operador:profiles!pesajes_maquina_operador_id_fkey(full_name),
       check_in:check_ins(asignacion_id),
       items:pesaje_tolva_items(
         id, tolva_id, gramos_teoricos, gramos_medidos,
         diferencia_gramos, diferencia_porcentaje, valor_diferencia,
         alerta_generada, notas
       )`,
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!pesaje) notFound();

  const maquina = Array.isArray(pesaje.maquina)
    ? pesaje.maquina[0]
    : pesaje.maquina;
  const operador = Array.isArray(pesaje.operador)
    ? pesaje.operador[0]
    : pesaje.operador;
  const checkIn = Array.isArray(pesaje.check_in)
    ? pesaje.check_in[0]
    : pesaje.check_in;

  const items = Array.isArray(pesaje.items) ? pesaje.items : [];
  const tolvaIds = items.map((it) => it.tolva_id);
  const { data: tolvas } =
    tolvaIds.length > 0
      ? await supabase.from("tolvas").select("id, numero").in("id", tolvaIds)
      : { data: [] };
  const tolvaNumeroById = new Map<string, number>();
  for (const t of tolvas ?? []) tolvaNumeroById.set(t.id, t.numero);

  const { data: jornada } = checkIn
    ? await supabase
        .from("jornadas")
        .select("id")
        .eq("asignacion_id", checkIn.asignacion_id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-6">
      <div>
        {jornada && (
          <Link
            href={`/admin/jornadas/${jornada.id}`}
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Volver a jornada
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Editar pesaje
        </h1>
        <p className="text-sm text-zinc-600">
          {maquina?.serie}
          {maquina?.alias ? ` · ${maquina.alias}` : ""} ·{" "}
          {operador?.full_name ?? "—"} ·{" "}
          {fmtCDMX(pesaje.fecha, {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        Al cambiar <strong>gramos medidos</strong>, el sistema:
        <ul className="ml-4 mt-1 list-disc">
          <li>Actualiza el inventario de la tolva por el delta.</li>
          <li>
            Inserta un movimiento <code>ajuste_conteo_maquina</code> compensatorio
            en el kardex (append-only).
          </li>
          <li>Recalcula la diferencia y el valor.</li>
        </ul>
      </div>

      <EditarPesajeForm
        items={items.map((it) => ({
          id: it.id,
          tolva_numero: tolvaNumeroById.get(it.tolva_id) ?? 0,
          gramos_teoricos: it.gramos_teoricos,
          gramos_medidos: it.gramos_medidos,
          diferencia_gramos: it.diferencia_gramos,
          diferencia_porcentaje: it.diferencia_porcentaje,
          valor_diferencia: it.valor_diferencia,
        }))}
        vasos={
          maquina?.vaso_producto_id
            ? {
                pesaje_id: pesaje.id,
                producto_nombre: (() => {
                  const vp = Array.isArray(maquina.vaso_producto)
                    ? maquina.vaso_producto[0]
                    : maquina.vaso_producto;
                  return vp?.nombre ?? "Vaso";
                })(),
                vasos_teoricos: pesaje.vasos_teoricos,
                vasos_medidos: pesaje.vasos_medidos,
                vasos_costo_unitario: pesaje.vasos_costo_unitario,
                vasos_valor_diferencia: pesaje.vasos_valor_diferencia,
              }
            : null
        }
      />
    </div>
  );
}
