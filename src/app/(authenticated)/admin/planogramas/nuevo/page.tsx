import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import PlanogramaForm from "../PlanogramaForm";

export const metadata = { title: "Nuevo planograma · Innovaypunto" };

export default async function NuevoPlanogramaPage() {
  await requireRole("admin", "direccion");

  const supabase = createClient();
  const { data: productos } = await supabase
    .from("productos")
    .select("id, sku, nombre, gramaje_servicio_default, precio_venta_default")
    .eq("activo", true)
    .order("nombre");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/planogramas"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Planogramas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nuevo planograma
        </h1>
        <p className="text-sm text-zinc-500">
          Define producto, gramaje y precio por tolva. Después aplica este
          template a múltiples máquinas desde su detalle.
        </p>
      </div>

      {(productos ?? []).length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No hay productos activos. Crea uno primero en{" "}
          <Link href="/admin/productos/nuevo" className="underline">
            Productos
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <PlanogramaForm mode="crear" productos={productos ?? []} />
        </div>
      )}
    </div>
  );
}
