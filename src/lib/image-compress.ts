/**
 * Comprime imágenes en el cliente antes de subir.
 *
 * Las cámaras de celulares producen archivos de 5-12 MB que cargados en
 * memoria como ImageData hacen que el navegador móvil se quede sin RAM.
 * Esta función las redimensiona a un máximo razonable y las re-codifica
 * como JPEG de calidad 85%, típicamente reduciendo a < 500 KB.
 *
 * Si algo falla (formato raro, sin canvas, etc.), devuelve el archivo
 * original — preferimos subir algo grande a no subir nada.
 */
export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<File> {
  // Guard duro: si el browser no tiene las APIs necesarias, devolver original.
  if (
    typeof window === "undefined" ||
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return file;
  }

  // Más agresivo: 1280px max + quality 0.75 → ~150–300 KB típico.
  // Suficiente nitidez para evidencia operativa y muy ligero para
  // pasar el límite de Server Actions (10 MB pero queremos margen).
  const maxDim = opts.maxDim ?? 1280;
  const quality = opts.quality ?? 0.75;

  // Si ya es muy pequeña, no reprocesar.
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 400 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    let w = width;
    let h = height;
    if (Math.max(width, height) > maxDim) {
      if (width >= height) {
        w = maxDim;
        h = Math.round(height * (maxDim / width));
      } else {
        h = maxDim;
        w = Math.round(width * (maxDim / height));
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      } catch {
        resolve(null);
      }
    });
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
