"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  actualizarSurtidoItemDirecto,
  eliminarItemSurtido,
} from "../actions";

type Producto = { sku: string; nombre: string; tipo: "polvo" | "vaso" };

type Item = {
  id: string;
  cartuchos_sugeridos: number;
  cartuchos_entregados: number;
  vasos_sugeridos: number;
  vasos_entregados: number;
  producto: Producto | Producto[] | null;
};

type EstadoSave = "idle" | "guardando" | "guardado" | "error";

function useAutoSave(
  itemId: string,
  surtidoId: string,
  initial: { cartuchos: number; vasos: number },
) {
  const [cartuchos, setCartuchos] = useState(initial.cartuchos);
  const [vasos, setVasos] = useState(initial.vasos);
  const [estado, setEstado] = useState<EstadoSave>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef({ cartuchos: initial.cartuchos, vasos: initial.vasos });

  function programarGuardado(c: number, v: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setEstado("guardando");
    setError(null);
    timerRef.current = setTimeout(() => {
      if (lastSent.current.cartuchos === c && lastSent.current.vasos === v) {
        setEstado("idle");
        return;
      }
      startTransition(async () => {
        const r = await actualizarSurtidoItemDirecto({
          id: itemId,
          surtidoId,
          cartuchosEntregados: c,
          vasosEntregados: v,
        });
        if (r.ok) {
          lastSent.current = { cartuchos: c, vasos: v };
          setEstado("guardado");
          setTimeout(() => setEstado((s) => (s === "guardado" ? "idle" : s)), 1500);
        } else {
          setError(r.message);
          setEstado("error");
        }
      });
    }, 500);
  }

  function onChangeCartuchos(value: number) {
    setCartuchos(value);
    programarGuardado(value, vasos);
  }
  function onChangeVasos(value: number) {
    setVasos(value);
    programarGuardado(cartuchos, value);
  }

  // Limpieza
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { cartuchos, vasos, estado, error, onChangeCartuchos, onChangeVasos };
}

function Indicador({ estado }: { estado: EstadoSave }) {
  if (estado === "idle") return null;
  const cls =
    estado === "guardando"
      ? "text-zinc-500"
      : estado === "guardado"
        ? "text-green-700"
        : "text-red-700";
  const label =
    estado === "guardando"
      ? "Guardando…"
      : estado === "guardado"
        ? "✓ Guardado"
        : "Error";
  return <span className={`text-[10px] ${cls}`}>{label}</span>;
}

export default function SurtidoItemRow({
  item,
  surtidoId,
  editable,
}: {
  item: Item;
  surtidoId: string;
  editable: boolean;
}) {
  const prod = Array.isArray(item.producto) ? item.producto[0] : item.producto;
  const esPolvo = prod?.tipo === "polvo";

  const auto = useAutoSave(item.id, surtidoId, {
    cartuchos: item.cartuchos_entregados,
    vasos: item.vasos_entregados,
  });

  return (
    <tr className="align-top">
      <td className="px-4 py-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-medium text-zinc-900">{prod?.nombre ?? "—"}</div>
            <div className="font-mono text-xs text-zinc-500">
              {prod?.sku ?? "—"} · {prod?.tipo}
            </div>
          </div>
          {editable && (
            <form action={eliminarItemSurtido}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="surtido_id" value={surtidoId} />
              <button
                type="submit"
                title="Eliminar del surtido"
                className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Eliminar item"
              >
                ×
              </button>
            </form>
          )}
        </div>
        {auto.error && (
          <p className="mt-1 text-xs text-red-700">{auto.error}</p>
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
        {esPolvo ? item.cartuchos_sugeridos : "—"}
      </td>
      <td className="px-4 py-2 text-right">
        {esPolvo ? (
          <div className="inline-flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              value={auto.cartuchos}
              onChange={(e) =>
                auto.onChangeCartuchos(Math.max(0, Number(e.target.value) || 0))
              }
              disabled={!editable}
              className="w-20 rounded-md border border-zinc-300 px-2 py-0.5 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50"
            />
            <Indicador estado={auto.estado} />
          </div>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-zinc-600">
        {!esPolvo ? item.vasos_sugeridos : "—"}
      </td>
      <td className="px-4 py-2 text-right">
        {!esPolvo ? (
          <div className="inline-flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              value={auto.vasos}
              onChange={(e) =>
                auto.onChangeVasos(Math.max(0, Number(e.target.value) || 0))
              }
              disabled={!editable}
              className="w-20 rounded-md border border-zinc-300 px-2 py-0.5 text-right text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50"
            />
            <Indicador estado={auto.estado} />
          </div>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
    </tr>
  );
}
