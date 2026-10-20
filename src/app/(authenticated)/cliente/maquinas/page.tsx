import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mis máquinas · Innovaypunto" };
export const dynamic = "force-dynamic";

type Maquina = {
  id: string;
  serie: string;
  alias: string | null;
  tipo: string;
  estado: string;
  ubicacion: string;
  num_tolvas: number | null;
  ultima_visita_at: string | null;
  ultima_venta_at: string | null;
};

type Tolva = {
  id: string;
  maquina_id: string;
  numero: number;
  producto: string | null;
  inventario_actual_g: number | null;
  capacidad_g: number | null;
  porcentaje_lleno: number | null;
  ultimo_llenado_at: string | null;
};

export default async function ClienteMaquinasPage() {
  await requireRole("cliente", "admin", "direccion");
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const [{ data: maquinasRaw }, { data: tolvasRaw }] = await Promise.all([
    sb.from("v_cliente_maquinas").select("*").order("ubicacion"),
    sb.from("v_cliente_tolvas").select("*").order("numero"),
  ]);

  const maquinas = (maquinasRaw ?? []) as Maquina[];
  const tolvas = (tolvasRaw ?? []) as Tolva[];

  const porMaquina = new Map<string, Tolva[]>();
  for (const t of tolvas) {
    porMaquina.set(t.maquina_id, [...(porMaquina.get(t.maquina_id) ?? []), t]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis máquinas</h1>
        <p className="text-sm text-zinc-600">
          {maquinas.length} máquinas activas. El nivel de cada tolva es el que
          trae el sistema; se confirma en cada visita con el pesaje físico.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {maquinas.map((m) => {
          const ts = porMaquina.get(m.id) ?? [];
          const muda =
            m.estado === "operativa" &&
            (!m.ultima_venta_at ||
              Date.now() - new Date(m.ultima_venta_at).getTime() >
                12 * 3600 * 1000);

          return (
            <div
              key={m.id}
              className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
            >
              <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
                <div>
                  <div className="font-medium text-zinc-900">
                    {m.alias ?? m.serie}
                  </div>
                  <div className="text-xs text-zinc-500">{m.ubicacion}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      m.estado === "operativa"
                        ? "bg-green-100 text-green-700"
                        : "bg-zinc-200 text-zinc-700"
                    }`}
                  >
                    {m.estado}
                  </span>
                  {muda && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                      sin vender 12 h+
                    </span>
                  )}
                </div>
              </div>

              {m.tipo === "servicio" ? (
                <p className="px-4 py-3 text-xs text-zinc-500">
                  Máquina de servicio: no dispensa bebidas, se atiende con
                  checklist en cada visita.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-50">
                  {ts.map((t) => {
                    const pct = Number(t.porcentaje_lleno ?? 0);
                    return (
                      <li key={t.id} className="px-4 py-2">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="text-zinc-900">
                            <span className="text-xs text-zinc-400">
                              {t.numero}.
                            </span>{" "}
                            {t.producto ?? "— vacía —"}
                          </span>
                          <span className="tabular-nums text-xs text-zinc-500">
                            {Number(t.inventario_actual_g ?? 0).toLocaleString(
                              "es-MX",
                            )}{" "}
                            g
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={`h-full rounded-full ${
                              pct < 20
                                ? "bg-red-500"
                                : pct < 40
                                  ? "bg-amber-500"
                                  : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                  {ts.length === 0 && (
                    <li className="px-4 py-3 text-xs text-zinc-500">
                      Sin tolvas configuradas.
                    </li>
                  )}
                </ul>
              )}

              <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-2 text-[11px] text-zinc-500">
                Última visita:{" "}
                {m.ultima_visita_at
                  ? fmtCDMX(m.ultima_visita_at, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "sin registro"}
              </div>
            </div>
          );
        })}
      </div>

      {maquinas.length === 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          No hay máquinas registradas para tu cuenta.
        </div>
      )}
    </div>
  );
}
