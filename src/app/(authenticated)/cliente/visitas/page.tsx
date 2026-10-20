import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Visitas · Innovaypunto" };
export const dynamic = "force-dynamic";

type Visita = {
  id: string;
  serie: string;
  maquina: string | null;
  ubicacion: string;
  operador: string | null;
  fecha_entrada: string;
  fecha_salida: string | null;
  tiempo_en_sitio_seg: number | null;
  checkout_nayax_ok: boolean | null;
  checkout_maquina_limpia: boolean | null;
  checkout_productos_ok: boolean | null;
  hubo_llenado: boolean;
};

function duracion(seg: number | null): string {
  if (!seg || seg <= 0) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.round((seg % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default async function ClienteVisitasPage() {
  await requireRole("cliente", "admin", "direccion");
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data } = await sb
    .from("v_cliente_visitas")
    .select("*")
    .order("fecha_entrada", { ascending: false })
    .limit(300);

  const visitas = (data ?? []) as Visita[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bitácora de visitas
        </h1>
        <p className="text-sm text-zinc-600">
          Las últimas {visitas.length} visitas a tus sedes. La hora de entrada y
          salida se registra con GPS desde la app del operador.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Sede</th>
              <th className="px-3 py-2 font-medium">Máquina</th>
              <th className="px-3 py-2 font-medium">Atendió</th>
              <th className="px-3 py-2 text-right font-medium">En sitio</th>
              <th className="px-3 py-2 text-center font-medium">Surtió</th>
              <th className="px-3 py-2 text-center font-medium">Checklist</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visitas.map((v) => {
              const checklist = [
                v.checkout_nayax_ok,
                v.checkout_maquina_limpia,
                v.checkout_productos_ok,
              ];
              const ok = checklist.filter((c) => c === true).length;
              const capturado = checklist.filter((c) => c !== null).length;
              return (
                <tr key={v.id} className="hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {fmtCDMX(v.fecha_entrada, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{v.ubicacion}</td>
                  <td className="px-3 py-2 font-medium text-zinc-900">
                    {v.maquina ?? v.serie}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {v.operador ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600">
                    {duracion(v.tiempo_en_sitio_seg)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {v.hubo_llenado ? (
                      <span className="text-green-700">sí</span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {capturado === 0 ? (
                      <span className="text-xs text-zinc-400">sin captura</span>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          ok === capturado
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {ok}/{capturado}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visitas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Todavía no hay visitas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        El checklist de salida son tres puntos que el operador confirma antes de
        cerrar la visita: que el lector de pagos quedó activo, que la máquina
        quedó limpia y que los productos quedaron activos en pantalla.
      </p>
    </div>
  );
}
