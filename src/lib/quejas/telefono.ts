import { createHash } from "crypto";

/**
 * Seudonimización del teléfono del usuario que se queja.
 *
 * El número se captura pero NO se persiste: de aquí salen el hash —para
 * detectar al mismo usuario entre quejas— y los últimos 4 dígitos, que es lo
 * único legible que se guarda.
 *
 * Solo servidor. No importar desde un Client Component: la sal no debe llegar
 * al navegador.
 */

/**
 * Deja el número en los 10 dígitos nacionales, que es la forma canónica en
 * México. Sin esto la detección de reincidencia no sirve: "55 1234 5678" y
 * "+52 5512345678" son la misma persona y producirían hashes distintos.
 */
export function normalizarTelefono(entrada: string): string | null {
  let d = (entrada ?? "").replace(/\D/g, "");
  // Lada país (+52) y el 1 que algunos operadores anteponen.
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

export function ultimos4(telefonoNormalizado: string): string {
  return telefonoNormalizado.slice(-4);
}

/**
 * SHA-256 del número normalizado más una sal de entorno.
 *
 * La sal vive en QUEJAS_TELEFONO_SALT, nunca en la base ni en el repositorio:
 * sin ella, el hash guardado no se puede revertir por fuerza bruta aunque
 * alguien tenga acceso completo a la base.
 *
 * NO ROTAR la sal. Si cambia, los hashes viejos dejan de empatar con los nuevos
 * y se pierde todo el histórico de reincidencia.
 */
export function hashTelefono(telefonoNormalizado: string): string {
  const salt = process.env.QUEJAS_TELEFONO_SALT;
  if (!salt) {
    throw new Error(
      "Falta QUEJAS_TELEFONO_SALT en el entorno. Sin ella no se puede guardar la queja: el hash quedaría reversible por fuerza bruta.",
    );
  }
  return createHash("sha256").update(`${salt}:${telefonoNormalizado}`).digest("hex");
}

export type TelefonoSeudonimizado = {
  hash: string;
  ultimos4: string;
};

/**
 * Convierte lo que capturó el usuario en lo único que se guarda.
 * Devuelve null si el número no es válido, para que la acción lo rechace en
 * vez de guardar una queja que nunca va a empatar con nada.
 */
export function seudonimizarTelefono(
  entrada: string,
): TelefonoSeudonimizado | null {
  const norm = normalizarTelefono(entrada);
  if (!norm) return null;
  return { hash: hashTelefono(norm), ultimos4: ultimos4(norm) };
}
