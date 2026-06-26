import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import ProductoForm from "../ProductoForm";

export const metadata = { title: "Nuevo producto · Innovaypunto" };

export default async function NuevoProductoPage() {
  await requireRole("admin", "direccion", "compras");

  const supabase = createClient();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre");

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
          Nuevo producto
        </h1>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <ProductoForm mode="crear" clientes={clientes ?? []} />
      </div>
    </div>
  );
}
