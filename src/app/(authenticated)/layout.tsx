import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/login/actions";

const ROLE_NAV: { role: string; href: string; label: string }[] = [
  { role: "admin", href: "/admin/usuarios", label: "Usuarios" },
  { role: "direccion", href: "/admin/usuarios", label: "Usuarios" },
  { role: "admin", href: "/admin/productos", label: "Productos" },
  { role: "direccion", href: "/admin/productos", label: "Productos" },
  { role: "compras", href: "/admin/productos", label: "Productos" },
  { role: "admin", href: "/admin/proveedores", label: "Proveedores" },
  { role: "direccion", href: "/admin/proveedores", label: "Proveedores" },
  { role: "compras", href: "/admin/proveedores", label: "Proveedores" },
  { role: "compras", href: "/compras/ordenes", label: "Compras" },
  { role: "admin", href: "/compras/ordenes", label: "Compras" },
  { role: "direccion", href: "/compras/ordenes", label: "Compras" },
  { role: "almacen", href: "/almacen/recepciones", label: "Almacén" },
  { role: "admin", href: "/almacen/recepciones", label: "Almacén" },
  { role: "direccion", href: "/almacen/recepciones", label: "Almacén" },
  { role: "almacen", href: "/almacen/inventario", label: "Inventario" },
  { role: "admin", href: "/almacen/inventario", label: "Inventario" },
  { role: "direccion", href: "/almacen/inventario", label: "Inventario" },
  { role: "compras", href: "/almacen/inventario", label: "Inventario" },
  { role: "almacen", href: "/almacen/lotes", label: "Lotes" },
  { role: "admin", href: "/almacen/lotes", label: "Lotes" },
  { role: "direccion", href: "/almacen/lotes", label: "Lotes" },
  { role: "almacen", href: "/almacen/encartuchados", label: "Encartuchado" },
  { role: "admin", href: "/almacen/encartuchados", label: "Encartuchado" },
  { role: "direccion", href: "/almacen/encartuchados", label: "Encartuchado" },
  { role: "admin", href: "/admin/clientes", label: "Clientes" },
  { role: "direccion", href: "/admin/clientes", label: "Clientes" },
  { role: "admin", href: "/admin/maquinas", label: "Máquinas" },
  { role: "direccion", href: "/admin/maquinas", label: "Máquinas" },
  { role: "admin", href: "/admin/planogramas", label: "Planogramas" },
  { role: "direccion", href: "/admin/planogramas", label: "Planogramas" },
  { role: "admin", href: "/admin/rutas", label: "Rutas" },
  { role: "direccion", href: "/admin/rutas", label: "Rutas" },
  { role: "planeador", href: "/admin/rutas", label: "Rutas" },
  { role: "admin", href: "/planeacion/asignaciones", label: "Asignaciones" },
  { role: "direccion", href: "/planeacion/asignaciones", label: "Asignaciones" },
  { role: "planeador", href: "/planeacion/asignaciones", label: "Asignaciones" },
  { role: "admin", href: "/planeacion/surtidos", label: "Surtidos" },
  { role: "direccion", href: "/planeacion/surtidos", label: "Surtidos" },
  { role: "planeador", href: "/planeacion/surtidos", label: "Surtidos" },
  { role: "almacen", href: "/planeacion/surtidos", label: "Surtidos" },
  { role: "compras", href: "/compras", label: "Compras" },
  { role: "almacen", href: "/almacen", label: "Almacén" },
  { role: "planeador", href: "/planeacion", label: "Planeación" },
  { role: "operador", href: "/campo", label: "Campo" },
  { role: "direccion", href: "/direccion", label: "Dashboards" },
];

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Deduplicar links por href, mostrando solo los que aplican a los roles del usuario.
  const seen = new Set<string>();
  const links = ROLE_NAV.filter((item) => {
    if (!user.roles.includes(item.role as never)) return false;
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-base font-semibold tracking-tight">
              MuscleUp
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {links.map((l) => (
                <Link
                  key={`${l.role}-${l.href}`}
                  href={l.href}
                  className="rounded-md px-2 py-1 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs leading-tight">
              <div className="font-medium text-zinc-900">{user.fullName}</div>
              <div className="text-zinc-500">{user.roles.join(", ")}</div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
