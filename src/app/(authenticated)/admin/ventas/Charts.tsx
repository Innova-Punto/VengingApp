"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BRAND = "#1B3548";
const ACCENT = "#38BDF8";

const METODO_COLORS: Record<string, string> = {
  VISA: "#1A1F71",
  MASTERCARD: "#EB001B",
  AMERICAN: "#016FD0",
  EFECTIVO: "#16A34A",
  CASH: "#16A34A",
  CRYPTO: "#F7931A",
  "(sin método)": "#94A3B8",
};

function fmtMxnShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function colorMetodo(metodo: string, fallbackIdx: number) {
  const upper = metodo.toUpperCase();
  for (const key in METODO_COLORS) {
    if (upper.includes(key)) return METODO_COLORS[key];
  }
  const palette = ["#3B82F6", "#F59E0B", "#A855F7", "#EC4899", "#64748B"];
  return palette[fallbackIdx % palette.length];
}

export function IngresosPorDiaChart({
  data,
}: {
  data: { fecha: string; ingresos: number; utilidad: number }[];
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
              new Date(v).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
              })
            }
            tick={{ fontSize: 10, fill: "#71717A" }}
          />
          <YAxis tickFormatter={fmtMxnShort} tick={{ fontSize: 10, fill: "#71717A" }} />
          <Tooltip
            formatter={(v, name) => [
              `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
              name === "ingresos" ? "Ingreso neto" : "Utilidad",
            ]}
            labelFormatter={(v) =>
              new Date(v as string).toLocaleDateString("es-MX", {
                weekday: "short",
                day: "2-digit",
                month: "short",
              })
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="ingresos" fill={BRAND} name="Ingreso neto" />
          <Bar dataKey="utilidad" fill={ACCENT} name="Utilidad" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MixMetodoPagoChart({
  data,
}: {
  data: { metodo: string; valor: number }[];
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
            nameKey="metodo"
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
              <Cell key={entry.metodo} fill={colorMetodo(entry.metodo, idx)} />
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
