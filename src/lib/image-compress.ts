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
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.85;

  // Si ya es razonablemente pequeña, no reprocesar.
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 1.2 * 1024 * 1024) return file;

  try {
    // createImageBitmap decodifica eficientemente (off-thread).
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

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
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
