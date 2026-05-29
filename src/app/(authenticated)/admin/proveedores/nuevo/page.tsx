import Link from "next/link";

import { requireRole } from "@/lib/auth";

import ProveedorForm from "../ProveedorForm";

export const metadata = { title: "Nuevo proveedor · MuscleUp" };

export default async function NuevoProveedorPage() {
  await requireRole("admin", "direccion", "compras");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/proveedores"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Proveedores
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nuevo proveedor
        </h1>
      </div>

      <div className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6">
        <ProveedorForm mode="crear" />
      </div>
    </div>
  );
}
