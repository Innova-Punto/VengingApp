"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { cancelarSustitucion } from "./actions";

export default function CancelarButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const motivo = window.prompt("¿Por qué se cancela la sustitución?");
        if (motivo === null) return;
        startTransition(async () => {
          const r = await cancelarSustitucion({ id, motivo: motivo || null });
          if (!r.ok) window.alert(r.message);
          router.refresh();
        });
      }}
      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
    >
      {pending ? "…" : "Cancelar"}
    </button>
  );
}
