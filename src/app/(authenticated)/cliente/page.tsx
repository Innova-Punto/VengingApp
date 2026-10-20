import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Resumen · Innovaypunto" };
export const dynamic = "force-dynamic";

type VentaDia = {
  dia: string;
  maquina: string;
  ubicacion: string;
  unidades: number;
  ingreso_bruto: number;
};

type Maquina = {
  id: string;
  alias: string | null;
  serie: string;
  ubicacion: string;
  estado: string;
  ultima_visita_at: string | null;
  ultima_venta_at: string | null;
};

/**
 * Lo primero que ve el cliente al entrar: cómo va su operación.
 *
 * Todo sale de las vistas `v_cliente_*`, que ya vienen acotadas a su cliente
 * y sin una sola columna de costo. Esta pantalla no filtra nada por su cuenta:
 * si el acotamiento viviera aquí, bastaría una consulta a mano para saltárselo.
 */
export default async function ClienteResumenPage() {
  const user = await requireRole("cliente", "admin", "direccion");
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const [{ data: maquinasRaw }, { data: ventasRaw }, { data: incidencias }] =
    await Promise.all([
      sb.from("v_cliente_maquinas").select("*").order("ubicacion"),
      sb.from("v_cliente_ventas_dia").select("*").gte("dia", desde),
      sb
        .from("v_cliente_incidencias")
        .select("id, estado")
        .neq("estado", "cerrada"),
    ]);

  const maquinas = (maquinasRaw ?? []) as Maquina[];
  const ventas = (ventasRaw ?? []) as VentaDia[];

  const unidades = ventas.reduce((s, v) => s + Number(v.unidades ?? 0), 0);
  const ingreso = ventas.reduce((s, v) => s + Number(v.ingreso_bruto ?? 0), 0);

  // Máquina muda: más de 12 h sin vender. Es el mismo umbral que usa la alerta
  // interna, para que el cliente y nosotros no veamos cosas distintas.
  const ahora = Date.now();
  const mudas = maquinas.filter((m) => {
    if (m.estado !== "operativa") return false;
    if (!m.ultima_venta_at) return true;
    return ahora - new Date(m.ultima_venta_at).getTime() > 12 * 3600 * 1000;
  });

  // Venta por día, para la barra de tendencia.
  const porDia = new Map<string, number>();
  for (const v of ventas) {
    porDia.set(v.dia, (porDia.get(v.dia) ?? 0) + Number(v.ingreso_bruto ?? 0));
  }
  const dias = Array.from(porDia.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDia = Math.max(1, ...dias.map((d) => d[1]));

  // Las sedes que más venden en el periodo.
  const porUbicacion = new Map<string, { unidades: number; ingreso: number }>();
  for (const v of ventas) {
    const acc = porUbicacion.get(v.ubicacion) ?? { unidades: 0, ingreso: 0 };
    acc.unidades += Number(v.unidades ?? 0);
    acc.ingreso += Number(v.ingreso_bruto ?? 0);
    porUbicacion.set(v.ubicacion, acc);
  }
  const topSedes = Array.from(porUbicacion.entries())
    .sort((a, b) => b[1].ingreso - a[1].ingreso)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Resumen de operación
        </h1>
        <p className="text-sm text-zinc-600">
          Últimos 30 días · {user.fullName}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Máquinas activas" valor={maquinas.length.toLocaleString("es-MX")} />
        <Kpi label="Bebidas vendidas" valor={unidades.toLocaleString("es-MX")} />
        <Kpi
          label="Ingreso (con IVA)"
          valor={`$${ingreso.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <Kpi
          label="Incidencias abiertas"
          valor={String((incidencias ?? []).length)}
          tono={(incidencias ?? []).length > 0 ? "amber" : undefined}
        />
      </section>

      {mudas.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-medium text-amber-900">
            {mudas.length} máquina{mudas.length === 1 ? "" : "s"} sin vender en
            las últimas 12 horas
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Puede ser falta de producto, un problema de pago o que la sede
            estuvo cerrada. Ya estamos viendo cada una.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {mudas.slice(0, 12).map((m) => (
              <li
                key={m.id}
                className="rounded-full bg-white px-2 py-0.5 text-xs text-amber-900"
              >
                {m.alias ?? m.serie}
              </li>
            ))}
            {mudas.length > 12 && (
              <li className="px-2 py-0.5 text-xs text-amber-800">
                y {mudas.length - 12} más
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">
          Ingreso por día
        </h2>
        {dias.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            Todavía no hay ventas registradas en el periodo.
          </p>
        ) : (
          <div className="mt-4 flex h-32 items-end gap-1">
            {dias.map(([dia, monto]) => (
              <div
                key={dia}
                className="group relative flex-1 rounded-t bg-brand/80 transition hover:bg-brand"
                style={{ height: `${Math.max(3, (monto / maxDia) * 100)}%` }}
                title={`${dia}: $${monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
              />
            ))}
          </div>
        )}
        {dias.length > 0 && (
          <div className="mt-2 flex justify-between text-[11px] text-zinc-500">
            <span>{dias[0][0]}</span>
            <span>{dias[dias.length - 1][0]}</span>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            Sedes con más venta
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Sede</th>
              <th className="px-4 py-2 text-right font-medium">Bebidas</th>
              <th className="px-4 py-2 text-right font-medium">Ingreso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {topSedes.map(([sede, d]) => (
              <tr key={sede} className="hover:bg-zinc-50">
                <td className="px-4 py-2 text-zinc-900">{sede}</td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
                  {d.unidades.toLocaleString("es-MX")}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  ${d.ingreso.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            {topSedes.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                  Sin ventas en el periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            Últimas visitas
          </h2>
          <Link
            href="/cliente/visitas"
            className="text-xs text-zinc-600 hover:text-zinc-900"
          >
            Ver todas →
          </Link>
        </div>
        <ul className="divide-y divide-zinc-100">
          {maquinas
            .filter((m) => m.ultima_visita_at)
            .sort((a, b) =>
              (b.ultima_visita_at ?? "").localeCompare(a.ultima_visita_at ?? ""),
            )
            .slice(0, 6)
            .map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <span className="text-zinc-900">{m.alias ?? m.serie}</span>
                <span className="text-xs text-zinc-500">
                  {fmtCDMX(m.ultima_visita_at!, {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function Kpi({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: string;
  tono?: "amber";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tono === "amber"
          ? "border-amber-200 bg-amber-50"
          : "border-zinc-200 bg-white"
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{valor}</div>
    </div>
  );
}
