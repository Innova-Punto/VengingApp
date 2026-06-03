"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BRAND = "#1B3548";

const CLIENTE_PALETTE = [
  "#1B3548", // brand
  "#38BDF8", // sky
  "#16A34A", // green
  "#F59E0B", // amber
  "#A855F7", // purple
  "#EC4899", // pink
  "#0EA5E9",
  "#84CC16",
  "#F97316",
  "#64748B",
];

function fmtMxnShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

export function IngresosPorDiaChart({
  data,
}: {
  data: { fecha: string; ingresos: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-zinc-400">
        Sin ventas en el período.
      </div>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
          <XAxis
            dataKey="fecha"
            tickFormatter={(v) =>
              new Date(`${v}T12:00:00-06:00`).toLocaleDateString("es-MX", {
                timeZone: "America/Mexico_City",
                day: "2-digit",
                month: "short",
              })
            }
            tick={{ fontSize: 10, fill: "#71717A" }}
          />
          <YAxis tickFormatter={fmtMxnShort} tick={{ fontSize: 10, fill: "#71717A" }} />
          <Tooltip
            formatter={(v) =>
              `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`
            }
            labelFormatter={(v) =>
              new Date(`${v}T12:00:00-06:00`).toLocaleDateString("es-MX", {
                timeZone: "America/Mexico_City",
                weekday: "short",
                day: "2-digit",
                month: "short",
              })
            }
          />
          <Bar dataKey="ingresos" fill={BRAND} name="Venta bruta" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VentasPorClienteChart({
  data,
}: {
  data: { cliente: string; valor: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-zinc-400">
        Sin datos.
      </div>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="valor"
            nameKey="cliente"
            cx="50%"
            cy="50%"
            outerRadius={75}
            label={(props: { name?: string; percent?: number }) =>
              `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`
            }
            labelLine={false}
            style={{ fontSize: 10 }}
          >
            {data.map((entry, idx) => (
              <Cell
                key={entry.cliente}
                fill={CLIENTE_PALETTE[idx % CLIENTE_PALETTE.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) =>
              `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
