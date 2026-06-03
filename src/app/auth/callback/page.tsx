import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import CallbackFragmentHandler from "./CallbackFragmentHandler";

/**
 * Callback de autenticación. Maneja tres flujos:
 *
 *  1. PKCE (?code=...)         → exchangeCodeForSession en el server.
 *  2. OTP verify (?token_hash=&type=)  → verifyOtp en el server.
 *  3. Implicit (#access_token=&refresh_token=)  → solo el browser lo ve,
 *     un client component lo parsea y llama setSession.
 *
 * Si vienen de un invite, después de establecer sesión los mandamos a
 * /set-password para que definan password.
 */
export default async function CallbackPage({
  searchParams,
}: {
  searchParams: {
    code?: string;
    token_hash?: string;
    type?: string;
    next?: string;
    error?: string;
    error_description?: string;
  };
}) {
  const next = searchParams.next || "/";

  // Si Supabase mandó error vía query
  if (searchParams.error) {
    const msg =
      searchParams.error_description || searchParams.error;
    redirect(`/login?error=${encodeURIComponent(msg)}`);
  }

  // Caso 1: PKCE
  if (searchParams.code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(
      searchParams.code,
    );
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
    redirect(searchParams.type === "invite" ? "/set-password" : next);
  }

  // Caso 2: OTP verify
  if (searchParams.token_hash && searchParams.type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: searchParams.type as
        | "magiclink"
        | "invite"
        | "recovery"
        | "email_change"
        | "email"
        | "signup",
      token_hash: searchParams.token_hash,
    });
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
    redirect(searchParams.type === "invite" ? "/set-password" : next);
  }

  // Caso 3: Implicit flow — el access_token vive en el #fragmento que solo
  // el browser puede leer. Renderizamos un component cliente que lo parsea.
  return <CallbackFragmentHandler defaultNext={next} />;
}
