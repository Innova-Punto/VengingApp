import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import NuevoEncartuchadoForm from "./NuevoEncartuchadoForm";

export const metadata = { title: "Nueva producción · MuscleUp" };

export default async function NuevoEncartuchadoPage() {
  await requireRole("admin", "direccion", "almacen");

  const supabase = createClient();

  // Productos polvo activos con stock granel
  const { data: productos } = await supabase
    .from("productos")
    .select(
      `id, sku, nombre, gramaje_cartucho_default,
       lotes:lotes!inner(gramos_disponibles_granel)`,
    )
    .eq("activo", true)
    .eq("tipo", "polvo")
    .gt("lotes.gramos_disponibles_granel", 0)
    .order("nombre");

  // Agrupar por producto y sumar granel
  const productosConStock =
    productos?.map((p) => ({
      id: p.id,
      sku: p.sku,
      nombre: p.nombre,
      gramaje_cartucho_default: p.gramaje_cartucho_default,
      stock_total: (p.lotes ?? []).reduce(
        (sum, l) => sum + l.gramos_disponibles_granel,
        0,
      ),
    })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/almacen/encartuchados"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Encartuchados
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nueva producción
        </h1>
        <p className="text-sm text-zinc-500">
          El sistema consume granel del lote más antiguo primero (PEPS). El
          costo del cartucho es el promedio ponderado de los lotes
          consumidos.
        </p>
      </div>

      {productosConStock.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No hay polvos con stock granel disponible. Revisa{" "}
          <Link href="/almacen/lotes" className="underline">
            Lotes
          </Link>{" "}
          o registra una recepción.
        </div>
      ) : (
        <div className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-6">
          <NuevoEncartuchadoForm productos={productosConStock} />
        </div>
      )}
    </div>
  );
}
