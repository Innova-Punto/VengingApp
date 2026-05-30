import Link from "next/link";

import { requireUser, type AppRole } from "@/lib/auth";
import { signOut } from "@/app/(auth)/login/actions";
import NavMenu, { type NavGroup } from "@/components/NavMenu";

type ItemDef = { label: string; href: string };
type GroupDef = {
  label: string;
  roles: AppRole[];
  items: ItemDef[];
};

// Las secciones del nav. Cada grupo se muestra si el usuario tiene alguno
// de los roles indicados. Si está en el grupo, ve todos sus items.
const NAV_GROUPS: GroupDef[] = [
  {
    label: "Catálogos",
    roles: ["admin", "direccion", "compras", "planeador"],
    items: [
      { label: "Productos", href: "/admin/productos" },
      { label: "Proveedores", href: "/admin/proveedores" },
      { label: "Clientes", href: "/admin/clientes" },
      { label: "Máquinas", href: "/admin/maquinas" },
      { label: "Planogramas", href: "/admin/planogramas" },
      { label: "Rutas", href: "/admin/rutas" },
    ],
  },
  {
    label: "Compras",
    roles: ["admin", "direccion", "compras"],
    items: [{ label: "Órdenes de compra", href: "/compras/ordenes" }],
  },
  {
    label: "Almacén",
    roles: ["admin", "direccion", "almacen", "compras"],
    items: [
      { label: "Inventario", href: "/almacen/inventario" },
      { label: "Recepciones", href: "/almacen/recepciones" },
      { label: "Lotes", href: "/almacen/lotes" },
      { label: "Encartuchado", href: "/almacen/encartuchados" },
      { label: "Devoluciones", href: "/almacen/devoluciones" },
      { label: "Conteos", href: "/almacen/conteos" },
    ],
  },
  {
    label: "Planeación",
    roles: ["admin", "direccion", "planeador", "almacen"],
    items: [
      { label: "Asignaciones", href: "/planeacion/asignaciones" },
      { label: "Surtidos", href: "/planeacion/surtidos" },
    ],
  },
  {
    label: "Operación",
    roles: ["admin", "direccion", "operador"],
    items: [{ label: "Campo (móvil)", href: "/campo" }],
  },
  {
    label: "Admin",
    roles: ["admin", "direccion"],
    items: [
      { label: "Usuarios", href: "/admin/usuarios" },
      { label: "Jornadas (auditoría)", href: "/admin/jornadas" },
      { label: "Incidencias", href: "/admin/incidencias" },
      { label: "Cierres mensuales", href: "/admin/cierres" },
    ],
  },
];

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const visibles: NavGroup[] = NAV_GROUPS.filter((g) =>
    g.roles.some((r) => user.roles.includes(r)),
  ).map((g) => ({ label: g.label, items: g.items }));

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-base font-semibold tracking-tight">
              MuscleUp
            </Link>
            <NavMenu groups={visibles} />
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
