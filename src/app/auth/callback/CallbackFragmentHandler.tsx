"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function CallbackFragmentHandler({
  defaultNext,
}: {
  defaultNext: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) {
      setError("Link de autenticación inválido (sin token).");
      return;
    }

    const params = new URLSearchParams(hash.slice(1));

    // Supabase puede mandar errores en el fragmento también
    const errCode = params.get("error_code");
    const errDesc = params.get("error_description") || params.get("error");
    if (errCode || errDesc) {
      const msg = errDesc || errCode || "Error de autenticación.";
      setError(msg);
      const t = setTimeout(() => {
        router.replace(`/login?error=${encodeURIComponent(msg)}`);
      }, 1500);
      return () => clearTimeout(t);
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");

    if (!accessToken || !refreshToken) {
      setError("Faltan tokens en el link.");
      return;
    }

    const supabase = createClient();
    supabase.auth
      .setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      .then(({ error: sessErr }) => {
        if (sessErr) {
          setError(sessErr.message);
          return;
        }
        // Limpia el fragmento de la URL y redirige.
        const dest = type === "invite" ? "/set-password" : defaultNext;
        router.replace(dest);
        router.refresh();
      });
  }, [defaultNext, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="rounded-lg bg-white p-6 shadow">
        {error ? (
          <div>
            <p className="text-sm font-medium text-red-700">{error}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Redirigiendo a la pantalla de login...
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-600">Estableciendo sesión...</p>
        )}
      </div>
    </div>
  );
}
