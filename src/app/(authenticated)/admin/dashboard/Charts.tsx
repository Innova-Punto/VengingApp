"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BRAND = "#1B3548";
const ACCENT = "#38BDF8";

const CATEGORIA_COLORS: Record<string, string> = {
  tecnica: "#3B82F6",
  mantenimiento: "#F59E0B",
  inventario: "#EF4444",
  calidad: "#DC2626",
  logistica: "#71717A",
  externa: "#A855F7",
  comercial: "#EC4899",
  sistema: "#64748B",
  otro: "#94A3B8",
};

function fmtMxnShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

export function VentasPorDiaChart({
  data,
}: {
  data: { fecha: string; ingresos: number; utilidad: number }[];
}) {
  if (data.length === 0) {
    return (
      <Empty msg="Sin ventas en el período. Cuando conectes Nayax aparecerá la curva." />
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
          <XAxis
            dataKey="fecha"
            stroke="#71717A"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis
            stroke="#71717A"
            tick={{ fontSize: 10 }}
            tickFormatter={fmtMxnShort}
            width={48}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #E4E4E7",
              fontSize: 12,
            }}
            formatter={(value, name) => [
              `$${Number(value ?? 0).toLocaleString("es-MX", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`,
              name === "ingresos" ? "Ingresos" : "Utilidad",
            ]}
            labelFormatter={(v) => `Fecha: ${v}`}
          />
          <Line
            type="monotone"
            dataKey="ingresos"
            stroke={BRAND}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="utilidad"
            stroke={ACCENT}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopProductosChart({
  data,
}: {
  data: { nombre: string; utilidad: number }[];
}) {
  if (data.length === 0) {
    return <Empty msg="Sin ventas en el período." />;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data.slice(0, 5)}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" horizontal={false} />
          <XAxis
            type="number"
            stroke="#71717A"
            tick={{ fontSize: 10 }}
            tickFormatter={fmtMxnShort}
          />
          <YAxis
            type="category"
            dataKey="nombre"
            stroke="#71717A"
            tick={{ fontSize: 10 }}
            width={110}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #E4E4E7",
              fontSize: 12,
            }}
            formatter={(value) => [
              `$${Number(value ?? 0).toLocaleString("es-MX", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`,
              "Utilidad",
            ]}
          />
          <Bar dataKey="utilidad" fill={BRAND} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IncidenciasCategoriaChart({
  data,
}: {
  data: { categoria: string; count: number }[];
}) {
  if (data.length === 0) {
    return <Empty msg="Sin incidencias en el período." />;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="categoria"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={CATEGORIA_COLORS[entry.categoria] ?? "#71717A"}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #E4E4E7",
              fontSize: 12,
            }}
            formatter={(value, name) => [
              String(value ?? 0),
              String(name ?? "").charAt(0).toUpperCase() +
                String(name ?? "").slice(1),
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
      {msg}
    </div>
  );
}
