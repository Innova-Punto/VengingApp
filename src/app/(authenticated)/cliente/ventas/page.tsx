import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ventas · Innovaypunto" };
export const dynamic = "force-dynamic";

type SearchParams = { dias?: string };

type VentaDia = {
  dia: string;
  maquina: string | null;
  serie: string;
  ubicacion: string;
  unidades: number;
  gramos: number;
  ingreso_bruto: number;
  ingreso_sin_iva: number;
  iva: number;
};

type VentaProducto = {
  dia: string;
  bebida: string;
  unidades: number;
  ingreso_bruto: number;
};

const RANGOS = [
  { dias: 7, label: "7 días" },
  { dias: 30, label: "30 días" },
  { dias: 90, label: "90 días" },
];

function mxn(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function ClienteVentasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("cliente", "admin", "direccion");
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const dias = RANGOS.some((r) => String(r.dias) === searchParams.dias)
    ? Number(searchParams.dias)
    : 30;
  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const [{ data: porDiaRaw }, { data: porProdRaw }] = await Promise.all([
    sb.from("v_cliente_ventas_dia").select("*").gte("dia", desde),
    sb.from("v_cliente_ventas_producto").select("*").gte("dia", desde),
  ]);

  const filas = (porDiaRaw ?? []) as VentaDia[];
  const productos = (porProdRaw ?? []) as VentaProducto[];

  const totUnidades = filas.reduce((s, f) => s + Number(f.unidades ?? 0), 0);
  const totBruto = filas.reduce((s, f) => s + Number(f.ingreso_bruto ?? 0), 0);
  const totSinIva = filas.reduce((s, f) => s + Number(f.ingreso_sin_iva ?? 0), 0);
  const totIva = filas.reduce((s, f) => s + Number(f.iva ?? 0), 0);

  // Por máquina
  const porMaquina = new Map<
    string,
    { ubicacion: string; unidades: number; bruto: number }
  >();
  for (const f of filas) {
    const k = f.maquina ?? f.serie;
    const acc = porMaquina.get(k) ?? {
      ubicacion: f.ubicacion,
      unidades: 0,
      bruto: 0,
    };
    acc.unidades += Number(f.unidades ?? 0);
    acc.bruto += Number(f.ingreso_bruto ?? 0);
    porMaquina.set(k, acc);
  }
  const maquinas = Array.from(porMaquina.entries()).sort(
    (a, b) => b[1].bruto - a[1].bruto,
  );

  // Por bebida
  const porBebida = new Map<string, { unidades: number; bruto: number }>();
  for (const p of productos) {
    const acc = porBebida.get(p.bebida) ?? { unidades: 0, bruto: 0 };
    acc.unidades += Number(p.unidades ?? 0);
    acc.bruto += Number(p.ingreso_bruto ?? 0);
    porBebida.set(p.bebida, acc);
  }
  const bebidas = Array.from(porBebida.entries())
    .sort((a, b) => b[1].unidades - a[1].unidades)
    .slice(0, 15);
  const maxBebida = Math.max(1, ...bebidas.map((b) => b[1].unidades));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-sm text-zinc-600">
            Volumen e ingreso de tus máquinas. Los días se cortan a hora de la
            Ciudad de México.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-zinc-300 bg-white p-1">
          {RANGOS.map((r) => (
            <a
              key={r.dias}
              href={`/cliente/ventas?dias=${r.dias}`}
              className={`rounded px-3 py-1 text-sm ${
                dias === r.dias
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {r.label}
            </a>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Bebidas vendidas" valor={totUnidades.toLocaleString("es-MX")} />
        <Kpi label="Ingreso con IVA" valor={mxn(totBruto)} />
        <Kpi label="Ingreso sin IVA" valor={mxn(totSinIva)} />
        <Kpi label="IVA" valor={mxn(totIva)} />
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Por máquina</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Máquina</th>
                <th className="px-4 py-2 font-medium">Sede</th>
                <th className="px-4 py-2 text-right font-medium">Bebidas</th>
                <th className="px-4 py-2 text-right font-medium">Ingreso</th>
                <th className="px-4 py-2 text-right font-medium">Promedio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {maquinas.map(([nombre, d]) => (
                <tr key={nombre} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    {nombre}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{d.ubicacion}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
                    {d.unidades.toLocaleString("es-MX")}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {mxn(d.bruto)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs text-zinc-500">
                    {d.unidades > 0 ? mxn(d.bruto / d.unidades) : "—"}
                  </td>
                </tr>
              ))}
              {maquinas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    Sin ventas en el periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">
          Bebidas más vendidas
        </h2>
        <ul className="mt-3 space-y-2">
          {bebidas.map(([nombre, d]) => (
            <li key={nombre} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-zinc-900">{nombre}</span>
                <span className="tabular-nums text-xs text-zinc-500">
                  {d.unidades.toLocaleString("es-MX")} · {mxn(d.bruto)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${(d.unidades / maxBebida) * 100}%` }}
                />
              </div>
            </li>
          ))}
          {bebidas.length === 0 && (
            <li className="text-sm text-zinc-500">Sin ventas en el periodo.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{valor}</div>
    </div>
  );
}
