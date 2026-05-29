import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * Cliente admin con SERVICE_ROLE_KEY: bypassa RLS.
 *
 * SOLO usar en código del servidor (Server Actions, Route Handlers, Edge
 * Functions). NUNCA importar este módulo desde un Client Component.
 *
 * Casos de uso autorizados:
 * - Invitar usuarios (auth.admin.inviteUserByEmail).
 * - Listar usuarios de auth para el panel admin.
 * - Jobs / crons que deben escribir saltándose RLS.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.",
    );
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
