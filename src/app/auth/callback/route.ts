import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Handler del magic link / invite.
 *
 * Supabase redirige aquí con `?code=...` (PKCE) o `?token_hash=...&type=...`
 * (verifyOtp). Intercambiamos por una sesión y redirigimos a `next` si vino.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") || "/";

  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const errUrl = url.clone();
      errUrl.pathname = "/login";
      errUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(errUrl);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "magiclink" | "invite" | "recovery" | "email_change" | "email" | "signup",
      token_hash: tokenHash,
    });
    if (error) {
      const errUrl = url.clone();
      errUrl.pathname = "/login";
      errUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(errUrl);
    }
  } else {
    const errUrl = url.clone();
    errUrl.pathname = "/login";
    errUrl.searchParams.set("error", "Link de autenticación inválido.");
    return NextResponse.redirect(errUrl);
  }

  // Si vienen de un invite, mandar a definir password.
  const redirectUrl = url.clone();
  redirectUrl.search = "";
  redirectUrl.pathname = type === "invite" ? "/set-password" : next;
  return NextResponse.redirect(redirectUrl);
}
