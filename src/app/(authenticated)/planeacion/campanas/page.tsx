import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

import CampanaForm, {
  type MaquinaUI,
  type ProductoUI,
  type RecetaUI,
} from "./CampanaForm";
import { aplicarCampanaAhora, cancelarCampana } from "./actions";

export const metadata = { title: "Campañas de temporada · Innovaypunto" };
export const dynamic = "force-dynamic";

export default async function CampanasPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireRole("admin", "direccion", "planeador");
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const [{ data: recetasRaw }, { data: maquinasRaw }, { data: productos }, { data: campanas }] =
    await Promise.all([
      sb
        .from("recetas")
        .select(
          `id, nombre,
           items:receta_items(id, nombre, precio_venta,
             ingredientes:receta_item_ingredientes(tolva_numero, gramos))`,
        )
        .eq("activo", true)
        .order("nombre"),
      sb
        .from("maquinas")
        .select(
          `id, serie, alias,
           tolvas:tolvas(numero, producto_id, producto:productos(nombre))`,
        )
        .eq("tipo", "preparado")
        .eq("activo", true)
        .order("serie"),
      sb
        .from("productos")
        .select("id, nombre, sku")
        .eq("activo", true)
        .eq("tipo", "polvo")
        .order("nombre"),
      sb
        .from("campanas_temporada")
        .select(
          `id, nombre, estado, tolva_numero, created_at, aplicada_at, motivo_cancelacion,
           receta:recetas(nombre),
           entrante:productos!campanas_temporada_producto_entrante_id_fkey(nombre),
           saliente:productos!campanas_temporada_producto_saliente_id_fkey(nombre)`,
        )
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recetas: RecetaUI[] = ((recetasRaw ?? []) as any[]).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (r.items ?? []).map((it: any) => ({
      id: it.id,
      nombre: it.nombre,
      precio_venta: it.precio_venta != null ? Number(it.precio_venta) : null,
      ingredientes: it.ingredientes ?? [],
    })),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maquinas: MaquinaUI[] = ((maquinasRaw ?? []) as any[]).map((m) => ({
    id: m.id,
    serie: m.serie,
    alias: m.alias,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tolvas: (m.tolvas ?? []).map((t: any) => {
      const p = Array.isArray(t.producto) ? t.producto[0] : t.producto;
      return {
        numero: t.numero,
        producto_id: t.producto_id,
        producto_nombre: p?.nombre ?? null,
      };
    }),
  }));

  // Avance de cada campaña: cuántas máquinas ya cambiaron el polvo.
  const ids = (campanas ?? []).map((c: { id: string }) => c.id);
  const { data: subs } = ids.length
    ? await sb
        .from("sustituciones_tolva")
        .select("campana_id, estado")
        .in("campana_id", ids)
    : { data: [] };

  const avance = new Map<string, { hechas: number; total: number }>();
  for (const s of (subs ?? []) as { campana_id: string; estado: string }[]) {
    const a = avance.get(s.campana_id) ?? { hechas: 0, total: 0 };
    if (s.estado !== "cancelada") a.total += 1;
    if (s.estado === "ejecutada") a.hechas += 1;
    avance.set(s.campana_id, a);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campañas de temporada</h1>
        <p className="text-sm text-zinc-600">
          El sabor de temporada cambia el polvo <strong>y</strong> el nombre de la bebida. Aquí se
          define una vez; el operador ejecuta en campo y el menú se renombra solo cuando la última
          máquina lo hizo — nunca antes, para que ninguna venda un nombre que todavía no sirve.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(searchParams.error)}
        </p>
      )}

      {(campanas ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Campaña</th>
                <th className="px-4 py-2 font-medium">Cambio</th>
                <th className="px-4 py-2 font-medium">Avance</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {((campanas ?? []) as any[]).map((c) => {
                const rec = Array.isArray(c.receta) ? c.receta[0] : c.receta;
                const ent = Array.isArray(c.entrante) ? c.entrante[0] : c.entrante;
                const sal = Array.isArray(c.saliente) ? c.saliente[0] : c.saliente;
                const a = avance.get(c.id) ?? { hechas: 0, total: 0 };
                return (
                  <tr key={c.id} className="align-top">
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.nombre}</div>
                      <div className="text-xs text-zinc-500">
                        {rec?.nombre} · tolva {c.tolva_numero} ·{" "}
                        {fmtCDMX(c.created_at, { day: "2-digit", month: "short" })}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-700">
                      {sal?.nombre} → <strong>{ent?.nombre}</strong>
                    </td>
                    <td className="px-4 py-2 text-xs tabular-nums">
                      {a.hechas} de {a.total} máquinas
                      {a.total > 0 && a.hechas < a.total && c.estado === "programada" && (
                        <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-zinc-200">
                          <div
                            className="h-full rounded-full bg-zinc-800"
                            style={{ width: `${(a.hechas / a.total) * 100}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.estado === "aplicada"
                            ? "bg-green-100 text-green-700"
                            : c.estado === "cancelada"
                              ? "bg-zinc-200 text-zinc-600"
                              : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {c.estado}
                      </span>
                      {c.estado === "aplicada" && c.aplicada_at && (
                        <div className="mt-1 text-xs text-zinc-500">
                          {fmtCDMX(c.aplicada_at, { day: "2-digit", month: "short" })}
                        </div>
                      )}
                      {c.motivo_cancelacion && (
                        <div className="mt-1 text-xs text-zinc-500">{c.motivo_cancelacion}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {c.estado === "programada" && (
                        <div className="flex flex-col gap-2">
                          <form action={aplicarCampanaAhora}>
                            <input type="hidden" name="campana_id" value={c.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                              title="Renombra el menú sin esperar a las máquinas que faltan"
                            >
                              Aplicar ya
                            </button>
                          </form>
                          <form action={cancelarCampana} className="flex gap-1">
                            <input type="hidden" name="campana_id" value={c.id} />
                            <input
                              name="motivo"
                              required
                              placeholder="motivo"
                              className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-xs"
                            />
                            <button
                              type="submit"
                              className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                            >
                              Cancelar
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Nueva campaña</h2>
        <CampanaForm
          recetas={recetas}
          maquinas={maquinas}
          productos={(productos ?? []) as ProductoUI[]}
        />
      </div>
    </div>
  );
}
