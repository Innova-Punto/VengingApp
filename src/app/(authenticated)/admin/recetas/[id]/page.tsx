import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import RecetaForm from "../RecetaForm";

type Params = { id: string };

export const metadata = { title: "Editar receta · MuscleUp" };

export default async function EditarRecetaPage({ params }: { params: Params }) {
  await requireRole("admin", "direccion");

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: receta } = await (supabase as any)
    .from("recetas")
    .select("id, nombre, descripcion, num_tolvas, activo")
    .eq("id", params.id)
    .maybeSingle();
  if (!receta) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items } = await (supabase as any)
    .from("receta_items")
    .select(
      `id, nayax_item_code, nombre, precio_venta,
       ingredientes:receta_item_ingredientes(tolva_numero, gramos)`,
    )
    .eq("receta_id", params.id)
    .order("nayax_item_code");

  const existing = {
    id: receta.id as string,
    nombre: receta.nombre as string,
    descripcion: receta.descripcion as string | null,
    num_tolvas: receta.num_tolvas as number,
    items: (items ?? []).map(
      (it: {
        nayax_item_code: string;
        nombre: string;
        precio_venta: number | null;
        ingredientes: { tolva_numero: number; gramos: number }[];
      }) => ({
        nayax_item_code: it.nayax_item_code,
        nombre: it.nombre,
        precio_venta: it.precio_venta,
        ingredientes: it.ingredientes ?? [],
      }),
    ),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/admin/recetas" className="hover:underline">
          Recetas
        </Link>
        <span>/</span>
        <span className="text-zinc-700">{existing.nombre}</span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Editar receta
      </h1>
      <RecetaForm existing={existing} />
    </div>
  );
}
