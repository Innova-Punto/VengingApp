import Link from "next/link";

import { requireUser, type AppRole } from "@/lib/auth";
import { signOut } from "@/app/(auth)/login/actions";
import { Logo } from "@/components/Logo";
import NavMenu, { type NavGroup } from "@/components/NavMenu";

type ItemDef = { label: string; href: string; roles?: AppRole[] };
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
      { label: "Recetas", href: "/admin/recetas" },
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
      {
        label: "Emergencias",
        href: "/planeacion/emergencias",
        roles: ["admin", "direccion", "almacen"],
      },
      { label: "Surtidos", href: "/planeacion/surtidos" },
      { label: "Devoluciones", href: "/almacen/devoluciones" },
    ],
  },
  {
    label: "Operación",
    roles: ["admin", "direccion", "operador"],
    items: [
      {
        label: "Campo (móvil)",
        href: "/campo",
        roles: ["operador", "admin", "direccion"],
      },
      {
        label: "Dashboard supervisión",
        href: "/admin/supervision",
        roles: ["admin", "direccion"],
      },
      {
        label: "Jornadas (auditoría)",
        href: "/admin/jornadas",
        roles: ["admin", "direccion"],
      },
      {
        label: "Incidencias",
        href: "/admin/incidencias",
        roles: ["admin", "direccion"],
      },
      {
        label: "Errores operativos",
        href: "/admin/errores-operativos",
        roles: ["admin", "direccion"],
      },
    ],
  },
  {
    label: "Admin",
    roles: ["admin", "direccion"],
    items: [
      { label: "Dashboard", href: "/admin/dashboard" },
      { label: "Usuarios", href: "/admin/usuarios" },
      { label: "Cierres mensuales", href: "/admin/cierres" },
      { label: "Ventas", href: "/admin/ventas" },
      { label: "Ventas intercompany", href: "/admin/ventas-intercompany" },
      { label: "Nayax", href: "/admin/nayax" },
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
  )
    .map((g) => ({
      label: g.label,
      items: g.items.filter(
        (it) => !it.roles || it.roles.some((r) => user.roles.includes(r)),
      ),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-brand text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center">
              <Logo size="md" />
            </Link>
            <NavMenu groups={visibles} />
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs leading-tight">
              <div className="font-medium text-white">{user.fullName}</div>
              <div className="text-white/70">{user.roles.join(", ")}</div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
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
