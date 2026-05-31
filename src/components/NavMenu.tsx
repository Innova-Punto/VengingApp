"use client";

import {
  Box,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavItem = { label: string; href: string };
export type NavGroup = { label: string; items: NavItem[] };

// Map grupo → icono. Si un grupo no tiene match, no se renderiza icono.
const GROUP_ICONS: Record<string, LucideIcon> = {
  "Catálogos": Box,
  "Compras": ShoppingCart,
  "Almacén": Warehouse,
  "Planeación": ClipboardList,
  "Operación": Truck,
  "Admin": Settings,
};

const ITEM_ICONS: Record<string, LucideIcon> = {
  "/admin/dashboard": LayoutDashboard,
};

export default function NavMenu({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node)
      ) {
        setOpenIdx(null);
      }
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    setOpenIdx(null);
  }, [pathname]);

  return (
    <div ref={rootRef} className="flex items-center gap-1 text-sm">
      {groups.map((g, i) => {
        const isActive = g.items.some((it) => pathname.startsWith(it.href));
        const isOpen = openIdx === i;
        const Icon = GROUP_ICONS[g.label];
        return (
          <div key={g.label} className="relative">
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${
                isActive
                  ? "bg-white/15 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} />}
              {g.label}
              <ChevronDown
                className={`h-3 w-3 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
                {g.items.map((it) => {
                  const active = pathname.startsWith(it.href);
                  const ItemIcon = ITEM_ICONS[it.href];
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm transition ${
                        active
                          ? "bg-zinc-100 font-medium text-zinc-900"
                          : "text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {ItemIcon && (
                        <ItemIcon
                          className="h-3.5 w-3.5 text-zinc-500"
                          strokeWidth={2}
                        />
                      )}
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
