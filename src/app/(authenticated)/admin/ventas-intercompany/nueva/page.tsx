import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import NuevaVentaForm from "./NuevaVentaForm";

export const metadata = { title: "Nueva venta intercompany · Innovaypunto" };

export default async function NuevaVentaIntercompanyPage() {
  await requireRole("admin", "direccion", "almacen");
  const supabase = createClient();

  const [{ data: empresas }, { data: productos }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre")
      .eq("es_intercompany", true)
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("productos")
      .select("id, sku, nombre, tipo")
      .eq("activo", true)
      .in("tipo", ["polvo", "vaso"])
      .order("sku"),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/ventas-intercompany"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Ventas intercompany
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nueva venta intercompany
        </h1>
        <p className="text-sm text-zinc-600">
          El sistema toma el costo del lote más viejo disponible (PEPS) y
          calcula precio = costo × (1 + margen).
        </p>
      </div>

      {(empresas ?? []).length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No hay clientes marcados como intercompany. Marca uno en{" "}
          <Link href="/admin/clientes" className="font-medium underline">
            /admin/clientes
          </Link>{" "}
          (flag &quot;es intercompany&quot;) antes de registrar la venta.
        </div>
      ) : (
        <NuevaVentaForm
          empresas={empresas ?? []}
          productos={productos ?? []}
        />
      )}
    </div>
  );
}
