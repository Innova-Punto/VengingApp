"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavItem = { label: string; href: string };
export type NavGroup = { label: string; items: NavItem[] };

export default function NavMenu({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Cierra el dropdown al click fuera
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

  // Cierra al cambiar de ruta
  useEffect(() => {
    setOpenIdx(null);
  }, [pathname]);

  return (
    <div ref={rootRef} className="flex items-center gap-1 text-sm">
      {groups.map((g, i) => {
        const isActive = g.items.some((it) => pathname.startsWith(it.href));
        const isOpen = openIdx === i;
        return (
          <div key={g.label} className="relative">
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 transition ${
                isActive
                  ? "bg-white/15 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              {g.label}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-zinc-200 bg-white py-1 shadow-md">
                {g.items.map((it) => {
                  const active = pathname.startsWith(it.href);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`block px-3 py-1.5 text-sm transition ${
                        active
                          ? "bg-zinc-100 font-medium text-zinc-900"
                          : "text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
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
