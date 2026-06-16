/**
 * Sube fotos del navegador directamente a Supabase Storage, sin pasar por
 * Server Actions. Esto evita que un upload pesado/lento tumbe la función
 * serverless de Vercel (que tiene timeout corto) cuando el operador está
 * en campo con señal débil.
 *
 * Hace hasta `maxRetries` reintentos automáticos. Si todos fallan, lanza
 * un Error con un mensaje legible — el caller decide qué hacer (reintentar
 * de nuevo o continuar sin foto).
 *
 * Devuelve la ruta `bucket/path.ext` compatible con el formato que ya
 * está almacenado en la BD (mismas columnas `foto_evidencia_url`,
 * `foto_salida_url`, etc.).
 */

import { createClient } from "@/lib/supabase/client";

export type SubirFotoResult = { path: string };

export async function subirFotoCliente({
  bucket,
  path,
  file,
  maxRetries = 2,
}: {
  bucket: string;
  /** Sin extensión — se agrega automáticamente a partir del nombre del archivo. */
  path: string;
  file: File;
  /** Reintentos en caso de error de red. Default 2 (total 3 intentos). */
  maxRetries?: number;
}): Promise<SubirFotoResult> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const fullPath = `${path}.${ext}`;

  let lastError: unknown = null;
  for (let intento = 0; intento <= maxRetries; intento++) {
    if (intento > 0) {
      // Backoff entre reintentos: 1s, 2s
      await new Promise((r) => setTimeout(r, 1000 * intento));
    }
    const { error } = await supabase.storage.from(bucket).upload(fullPath, file, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
    if (!error) {
      return { path: `${bucket}/${fullPath}` };
    }
    lastError = error;
  }

  const msg =
    lastError instanceof Error
      ? lastError.message
      : typeof lastError === "object" && lastError && "message" in lastError
        ? String((lastError as { message: unknown }).message)
        : "Error desconocido al subir la foto.";
  throw new Error(msg);
}
