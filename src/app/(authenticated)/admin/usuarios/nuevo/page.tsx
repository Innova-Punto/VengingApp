import Link from "next/link";

import { requireRole } from "@/lib/auth";
import InvitarForm from "./InvitarForm";

export const metadata = { title: "Invitar usuario · Innovaypunto" };

export default async function NuevoUsuarioPage() {
  await requireRole("admin", "direccion");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/usuarios"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Usuarios
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Invitar nuevo usuario
        </h1>
        <p className="text-sm text-zinc-600">
          Se enviará un correo con un link para que active su cuenta.
        </p>
      </div>

      <div className="max-w-xl rounded-lg border border-zinc-200 bg-white p-6">
        <InvitarForm />
      </div>
    </div>
  );
}
