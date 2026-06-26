import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import NuevaOcForm from "./NuevaOcForm";

export const metadata = { title: "Nueva OC · Innovaypunto" };

export default async function NuevaOcPage() {
  await requireRole("admin", "direccion", "compras");

  const supabase = createClient();
  const { data: proveedores } = await supabase
    .from("proveedores")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/compras/ordenes"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Órdenes de compra
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nueva orden de compra
        </h1>
        <p className="text-sm text-zinc-500">
          La OC se crea en estado &laquo;borrador&raquo;. Los items se
          agregan desde el detalle.
        </p>
      </div>

      {(proveedores ?? []).length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No hay proveedores activos. Crea uno primero en{" "}
          <Link href="/admin/proveedores" className="underline">
            Proveedores
          </Link>
          .
        </div>
      ) : (
        <div className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-6">
          <NuevaOcForm proveedores={proveedores ?? []} />
        </div>
      )}
    </div>
  );
}
