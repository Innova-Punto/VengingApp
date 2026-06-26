import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import PlanogramaForm from "../PlanogramaForm";

export const metadata = { title: "Editar planograma · Innovaypunto" };

export default async function EditarPlanogramaPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion");

  const supabase = createClient();

  const [
    { data: planograma, error },
    { data: items },
    { data: productos },
  ] = await Promise.all([
    supabase.from("planogramas").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("planograma_items")
      .select(
        "numero, producto_id, gramaje_servicio, precio_venta, nayax_item_code",
      )
      .eq("planograma_id", params.id)
      .order("numero"),
    supabase
      .from("productos")
      .select("id, sku, nombre, gramaje_servicio_default, precio_venta_default")
      .eq("activo", true)
      .order("nombre"),
  ]);

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!planograma) notFound();

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
          {planograma.nombre}
        </h1>
        {planograma.descripcion && (
          <p className="text-sm text-zinc-500">{planograma.descripcion}</p>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <PlanogramaForm
          mode="editar"
          planograma={planograma}
          items={items ?? []}
          productos={productos ?? []}
        />
      </div>
    </div>
  );
}
