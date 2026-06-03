"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Option = { id: string; label: string };

const RANGOS = [
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "90d", label: "90 días" },
];

export default function VentasFilters({
  rango,
  maquina,
  cliente,
  producto,
  metodo,
  utilidad,
  maquinas,
  clientes,
  productos,
  metodos,
}: {
  rango: string;
  maquina: string;
  cliente: string;
  producto: string;
  metodo: string;
  utilidad: "todas" | "negativas";
  maquinas: Option[];
  clientes: Option[];
  productos: Option[];
  metodos: string[];
}) {
  const router = useRouter();
  const currentParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const params = new URLSearchParams(currentParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    startTransition(() => router.push(`/admin/ventas?${params.toString()}`));
  }

  function clearAll() {
    startTransition(() => router.push("/admin/ventas?rango=hoy"));
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-end gap-2">
        {/* Rango */}
        <div className="flex flex-col">
          <label className="text-[10px] uppercase tracking-wide text-zinc-500">
            Rango
          </label>
          <div className="mt-0.5 flex gap-1">
            {RANGOS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => update("rango", r.key)}
                disabled={isPending}
                className={`rounded-md border px-2 py-1 text-xs ${
                  rango === r.key
                    ? "border-brand bg-brand text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Máquina */}
        <div className="flex min-w-[200px] flex-col">
          <label className="text-[10px] uppercase tracking-wide text-zinc-500">
            Máquina
          </label>
          <select
            value={maquina}
            onChange={(e) => update("maquina", e.target.value)}
            disabled={isPending}
            className="mt-0.5 rounded-md border border-zinc-300 px-2 py-1 text-xs shadow-sm"
          >
            <option value="">Todas</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Cliente */}
        <div className="flex min-w-[150px] flex-col">
          <label className="text-[10px] uppercase tracking-wide text-zinc-500">
            Cliente
          </label>
          <select
            value={cliente}
            onChange={(e) => update("cliente", e.target.value)}
            disabled={isPending}
            className="mt-0.5 rounded-md border border-zinc-300 px-2 py-1 text-xs shadow-sm"
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Producto */}
        <div className="flex min-w-[200px] flex-col">
          <label className="text-[10px] uppercase tracking-wide text-zinc-500">
            Producto
          </label>
          <select
            value={producto}
            onChange={(e) => update("producto", e.target.value)}
            disabled={isPending}
            className="mt-0.5 rounded-md border border-zinc-300 px-2 py-1 text-xs shadow-sm"
          >
            <option value="">Todos</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Método */}
        <div className="flex min-w-[120px] flex-col">
          <label className="text-[10px] uppercase tracking-wide text-zinc-500">
            Método pago
          </label>
          <select
            value={metodo}
            onChange={(e) => update("metodo", e.target.value)}
            disabled={isPending}
            className="mt-0.5 rounded-md border border-zinc-300 px-2 py-1 text-xs shadow-sm"
          >
            <option value="">Todos</option>
            {metodos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Utilidad */}
        <div className="flex flex-col">
          <label className="text-[10px] uppercase tracking-wide text-zinc-500">
            Utilidad
          </label>
          <div className="mt-0.5 flex gap-1">
            <button
              type="button"
              onClick={() => update("utilidad", "")}
              disabled={isPending}
              className={`rounded-md border px-2 py-1 text-xs ${
                utilidad === "todas"
                  ? "border-brand bg-brand text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => update("utilidad", "negativas")}
              disabled={isPending}
              className={`rounded-md border px-2 py-1 text-xs ${
                utilidad === "negativas"
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              Negativas
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={clearAll}
          disabled={isPending}
          className="ml-auto rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
