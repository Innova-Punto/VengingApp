import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import ProductoForm from "../ProductoForm";

export const metadata = { title: "Editar producto · MuscleUp" };

export default async function EditarProductoPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin", "direccion", "compras");

  const supabase = createClient();

  const [{ data: producto, error }, { data: clientes }] = await Promise.all([
    supabase.from("productos").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("clientes").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Error: {error.message}
      </p>
    );
  }
  if (!producto) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/productos"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Productos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {producto.nombre}
        </h1>
        <p className="text-sm text-zinc-500 font-mono">{producto.sku}</p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <ProductoForm
          mode="editar"
          producto={producto}
          clientes={clientes ?? []}
        />
      </div>
    </div>
  );
}
