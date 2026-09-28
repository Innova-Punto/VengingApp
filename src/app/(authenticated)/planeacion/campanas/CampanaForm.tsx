"use client";

import { useMemo, useState, useTransition } from "react";

import { crearCampana, type BebidaCampana } from "./actions";

export type RecetaUI = {
  id: string;
  nombre: string;
  items: {
    id: string;
    nombre: string;
    precio_venta: number | null;
    ingredientes: { tolva_numero: number; gramos: number }[];
  }[];
};

export type MaquinaUI = {
  id: string;
  serie: string;
  alias: string | null;
  tolvas: { numero: number; producto_id: string | null; producto_nombre: string | null }[];
};

export type ProductoUI = { id: string; nombre: string; sku: string };

/**
 * Armar una campaña es una cadena de consecuencias, y la pantalla la enseña
 * conforme se decide: eliges receta y tolva, y abajo aparecen las máquinas que
 * van a cambiar y las bebidas que se van a renombrar. Nadie debería confirmar
 * un cambio de temporada sin ver esas dos listas.
 */
export default function CampanaForm({
  recetas,
  maquinas,
  productos,
}: {
  recetas: RecetaUI[];
  maquinas: MaquinaUI[];
  productos: ProductoUI[];
}) {
  const [nombre, setNombre] = useState("");
  const [recetaId, setRecetaId] = useState(recetas[0]?.id ?? "");
  const [tolva, setTolva] = useState<number | null>(null);
  const [entranteId, setEntranteId] = useState("");
  const [bebidas, setBebidas] = useState<Record<string, BebidaCampana>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [, startTransition] = useTransition();

  const receta = recetas.find((r) => r.id === recetaId);

  /** Las tolvas que esa receta usa de verdad. */
  const tolvasDeLaReceta = useMemo(() => {
    const s = new Set<number>();
    for (const it of receta?.items ?? []) {
      for (const ing of it.ingredientes) s.add(ing.tolva_numero);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [receta]);

  /** Máquinas que hoy tienen producto en esa tolva, agrupadas por producto. */
  const candidatas = useMemo(() => {
    if (tolva === null) return [];
    return maquinas
      .map((m) => {
        const t = m.tolvas.find((x) => x.numero === tolva);
        return t?.producto_id
          ? { ...m, producto_id: t.producto_id, producto_nombre: t.producto_nombre }
          : null;
      })
      .filter((m): m is MaquinaUI & { producto_id: string; producto_nombre: string | null } => !!m);
  }, [maquinas, tolva]);

  // El producto que sale es el que está hoy en esa tolva. Si hay más de uno
  // entre las máquinas, se toma el más común y se avisa: significa que el
  // parque no está parejo y la campaña no las va a cubrir todas.
  const productoSaliente = useMemo(() => {
    const cuenta = new Map<string, { n: number; nombre: string | null }>();
    for (const c of candidatas) {
      const prev = cuenta.get(c.producto_id) ?? { n: 0, nombre: c.producto_nombre };
      cuenta.set(c.producto_id, { n: prev.n + 1, nombre: c.producto_nombre });
    }
    return Array.from(cuenta.entries()).sort((a, b) => b[1].n - a[1].n)[0] ?? null;
  }, [candidatas]);

  const maquinasQueCambian = productoSaliente
    ? candidatas.filter((c) => c.producto_id === productoSaliente[0])
    : [];
  const maquinasQueNo = productoSaliente
    ? candidatas.filter((c) => c.producto_id !== productoSaliente[0])
    : [];

  /** Bebidas de la receta que usan esa tolva: las candidatas a renombrarse. */
  const bebidasAfectadas = useMemo(() => {
    if (!receta || tolva === null) return [];
    return receta.items
      .map((it) => {
        const ing = it.ingredientes.find((x) => x.tolva_numero === tolva);
        return ing ? { item: it, gramos: ing.gramos } : null;
      })
      .filter((x): x is { item: RecetaUI["items"][number]; gramos: number } => !!x);
  }, [receta, tolva]);

  type Base = {
    nombre: string;
    precio: number | null;
    gramos: number;
    ingredientes: { tolva_numero: number; gramos: number }[];
  };

  function bebida(id: string, base: Base): BebidaCampana {
    return (
      bebidas[id] ?? {
        receta_item_id: id,
        nombre_anterior: base.nombre,
        precio_anterior: base.precio,
        gramos_anteriores: base.gramos,
        nombre_nuevo: "",
        precio_nuevo: base.precio,
        gramos_nuevos: base.gramos,
        // Arranca con la receta tal como está hoy: lo que no se toque, no cambia.
        ingredientes: base.ingredientes.map((i) => ({
          tolva_numero: i.tolva_numero,
          gramos_anteriores: i.gramos,
          gramos_nuevos: i.gramos,
        })),
      }
    );
  }

  function setBebida(id: string, cambios: Partial<BebidaCampana>, base: Base) {
    setBebidas((prev) => ({ ...prev, [id]: { ...bebida(id, base), ...cambios } }));
  }

  /** Cambia los gramos de una tolva en una bebida. Vacío = el ingrediente sale. */
  function setIngrediente(id: string, base: Base, tolvaNumero: number, valor: string) {
    const actual = bebida(id, base);
    const gramos = valor.trim() === "" ? null : Number(valor);
    const previo =
      base.ingredientes.find((i) => i.tolva_numero === tolvaNumero)?.gramos ?? null;

    const resto = actual.ingredientes.filter((i) => i.tolva_numero !== tolvaNumero);
    setBebida(
      id,
      {
        ingredientes: [
          ...resto,
          { tolva_numero: tolvaNumero, gramos_anteriores: previo, gramos_nuevos: gramos },
        ].sort((a, b) => a.tolva_numero - b.tolva_numero),
      },
      base,
    );
  }

  function enviar() {
    setError(null);
    if (!productoSaliente || tolva === null) {
      setError("Elige la receta y la tolva.");
      return;
    }
    // Solo van las bebidas a las que se les escribió nombre nuevo: si el sabor
    // no cambia de nombre, no tiene por qué entrar a la campaña.
    const lista = Object.values(bebidas).filter((b) => b.nombre_nuevo.trim());
    if (lista.length === 0) {
      setError("Escribe el nombre nuevo de al menos una bebida.");
      return;
    }

    setEnviando(true);
    startTransition(async () => {
      const r = await crearCampana({
        nombre,
        recetaId,
        tolvaNumero: tolva,
        productoSalienteId: productoSaliente[0],
        productoEntranteId: entranteId,
        maquinaIds: maquinasQueCambian.map((m) => m.id),
        bebidas: lista,
        notas: null,
      });
      if (!r.ok) {
        setError(r.message);
        setEnviando(false);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Nombre de la campaña
          </label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Halloween 2026 · Pumpkin"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Receta
          </label>
          <select
            value={recetaId}
            onChange={(e) => {
              setRecetaId(e.target.value);
              setTolva(null);
              setBebidas({});
            }}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {recetas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre} · {r.items.length} bebidas
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Tolva que cambia
          </label>
          <select
            value={tolva ?? ""}
            onChange={(e) => {
              setTolva(e.target.value ? Number(e.target.value) : null);
              setBebidas({});
            }}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">— elige —</option>
            {tolvasDeLaReceta.map((n) => (
              <option key={n} value={n}>
                Tolva {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Producto que entra
          </label>
          <select
            value={entranteId}
            onChange={(e) => setEntranteId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">— elige —</option>
            {productos
              .filter((p) => p.id !== productoSaliente?.[0])
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
        </div>
      </div>

      {tolva !== null && productoSaliente && (
        <>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold">
              Sale <span className="text-zinc-500">{productoSaliente[1].nombre}</span> de la tolva{" "}
              {tolva} en {maquinasQueCambian.length} máquinas
            </h3>
            <p className="mt-2 text-sm text-zinc-700">
              {maquinasQueCambian.map((m) => `${m.serie} ${m.alias ?? ""}`.trim()).join(" · ")}
            </p>
            {maquinasQueNo.length > 0 && (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Quedan fuera {maquinasQueNo.length}: traen otro producto en la tolva {tolva} (
                {maquinasQueNo.map((m) => `${m.serie} → ${m.producto_nombre}`).join(", ")}). El
                parque no está parejo; revísalo antes de lanzar la campaña.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Bebidas que usan esa tolva</h3>
              <p className="text-xs text-zinc-600">
                Escribe el nombre nuevo solo de las que cambian de sabor; las que dejes en
                blanco se quedan igual. Y ajusta la receta completa si el sabor nuevo pide
                otro balance — no solo la tolva que se sustituye.
              </p>
            </div>

            {bebidasAfectadas.map(({ item, gramos }) => {
              const base = {
                nombre: item.nombre,
                precio: item.precio_venta,
                gramos,
                ingredientes: item.ingredientes,
              };
              const b = bebida(item.id, base);
              const valorDe = (t: number) => {
                const ing = b.ingredientes.find((i) => i.tolva_numero === t);
                return ing?.gramos_nuevos ?? "";
              };
              const antesDe = (t: number) =>
                item.ingredientes.find((i) => i.tolva_numero === t)?.gramos ?? null;

              return (
                <div
                  key={item.id}
                  className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-48 flex-1">
                      <label className="text-xs text-zinc-500">{item.nombre}</label>
                      <input
                        value={b.nombre_nuevo}
                        onChange={(e) => setBebida(item.id, { nombre_nuevo: e.target.value }, base)}
                        placeholder="dejar en blanco = no cambia"
                        className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">Precio</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={b.precio_nuevo ?? ""}
                        onChange={(e) =>
                          setBebida(
                            item.id,
                            { precio_nuevo: e.target.value ? Number(e.target.value) : null },
                            base,
                          )
                        }
                        className="mt-1 w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-right text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Receta · gramos por tolva
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {tolvasDeLaReceta.map((t) => {
                        const antes = antesDe(t);
                        const esLaQueCambia = t === tolva;
                        return (
                          <div
                            key={t}
                            className={`rounded-md border px-2 py-1.5 ${
                              esLaQueCambia
                                ? "border-orange-300 bg-orange-50"
                                : "border-zinc-200 bg-white"
                            }`}
                          >
                            <div className="text-[10px] font-medium text-zinc-500">
                              Tolva {t}
                              {esLaQueCambia && " · cambia"}
                            </div>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={valorDe(t)}
                              onChange={(e) => setIngrediente(item.id, base, t, e.target.value)}
                              placeholder="—"
                              className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-right text-sm"
                            />
                            <div className="text-[10px] text-zinc-400">
                              {antes != null ? `antes ${antes}g` : "no la usaba"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Vacío = ese ingrediente sale de la bebida. Un número donde antes no había
                      = ingrediente nuevo.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || !entranteId || tolva === null}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {enviando ? "Creando…" : "Programar campaña"}
        </button>
        <p className="text-xs text-zinc-500">
          Se crea la sustitución pendiente en cada máquina. El menú se renombra solo cuando la
          última la ejecute.
        </p>
      </div>
    </div>
  );
}
