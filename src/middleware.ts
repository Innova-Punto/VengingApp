import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match todos los paths excepto:
     * - api (rutas server con su propia auth: CRON_SECRET, webhook secrets, etc.)
     * - _next/static (assets estáticos)
     * - _next/image (optimizador de imágenes)
     * - favicon.ico
     * - archivos con extensión (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
