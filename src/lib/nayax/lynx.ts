/**
 * Cliente para Lynx API - Operational de Nayax.
 *
 * Doc: https://lynx.nayax.com/Operational/swagger/ui/index
 *
 * Token: POST /v1/token/auth con usr/pwd. Cada llamada subsecuente lo
 * incluye en header `Authorization: Bearer <token>`.
 *
 * Las credenciales viven en variables de entorno:
 *   NAYAX_LYNX_USR
 *   NAYAX_LYNX_PWD
 *   NAYAX_LYNX_BASE_URL (default: https://lynx.nayax.com/Operational)
 */

import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_BASE = "https://lynx.nayax.com/Operational";

/** TokenId fijo. Mandando el mismo valor en cada login, Lynx reusa el slot. */
const TOKEN_ID = "INNOVAYPUNTO-APP";
/** Cuántos minutos antes de la expiración consideramos que hay que renovar. */
const REFRESH_MARGIN_MIN = 5;

type Token = {
  Token: string;
  ExpirationUTC: string;
  TokenId?: string;
};

export type LynxMachine = {
  MachineID: number;
  ActorID?: number;
  MachineName?: string | null;
  MachineNumber?: string | null;
  SerialNumber?: string | null;
  DeviceSerialNumber?: string | null;
  LocationID?: number | null;
  MachineStatusBit?: boolean | null;
};

export type LynxMachineProduct = {
  MachineProductID: number;
  NayaxProductID?: number;
  MachineID?: number;
  MDBCode?: number | null;
  PACode?: string | null;
  PCCode?: string | null;
  DEXProductName?: string | null;
  CashPrice?: number | null;
  CreditCardPrice?: number | null;
  MachinePrice?: number | null;
  RetailPrice?: number | null;
};

function baseUrl(): string {
  return process.env.NAYAX_LYNX_BASE_URL || DEFAULT_BASE;
}

function getCreds(): { usr: string; pwd: string } {
  const usr = process.env.NAYAX_LYNX_USR;
  const pwd = process.env.NAYAX_LYNX_PWD;
  if (!usr || !pwd) {
    throw new Error(
      "Faltan NAYAX_LYNX_USR o NAYAX_LYNX_PWD en variables de entorno.",
    );
  }
  return { usr, pwd };
}

/**
 * Obtiene un token bearer de Lynx con cache en BD.
 *
 * Lynx limita a 10 tokens concurrentes por usuario. Pedir uno nuevo en cada
 * server action lleva al límite y bloquea. Por eso:
 *   1. Cache en tabla nayax_token_cache: si hay uno vigente, se reutiliza.
 *   2. TokenId fijo (INNOVAYPUNTO-APP): cuando pedimos uno nuevo, Lynx reusa
 *      el slot del TokenId existente en lugar de crear otro.
 *   3. Expiración 12h (cómoda y evita renovar mientras se usa).
 */
export async function lynxGetToken(): Promise<string> {
  const supabase = createAdminClient();

  // 1. Intenta usar el cache si está vigente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cached } = (await (supabase as any)
    .from("nayax_token_cache")
    .select("token, expiration_utc")
    .eq("id", "default")
    .maybeSingle()) as {
    data: { token: string; expiration_utc: string } | null;
  };

  if (cached?.token && cached.expiration_utc) {
    const expMs = new Date(cached.expiration_utc).getTime();
    const marginMs = REFRESH_MARGIN_MIN * 60 * 1000;
    if (Date.now() < expMs - marginMs) {
      return cached.token;
    }
  }

  // 2. Cache vencido o vacío: pide token nuevo con TokenId fijo
  const { usr, pwd } = getCreds();
  const expDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h
  const expirationISO = expDate.toISOString();

  const res = await fetch(`${baseUrl()}/v1/token/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Usr: usr,
      Pwd: pwd,
      ExpirationUTC: expirationISO,
      TokenId: TOKEN_ID,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Lynx auth falló (${res.status}): ${text || res.statusText}`,
    );
  }

  const body = (await res.json()) as Token;
  if (!body?.Token) {
    throw new Error("Lynx auth no regresó Token.");
  }

  // 3. Guarda en cache para futuras invocaciones
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("nayax_token_cache").upsert({
    id: "default",
    token: body.Token,
    expiration_utc: body.ExpirationUTC ?? expirationISO,
    updated_at: new Date().toISOString(),
  });

  return body.Token;
}

/**
 * Borra el cache forzando que la próxima llamada pida un token nuevo.
 * Útil si el token cacheado dejó de funcionar (revoke remoto, etc).
 */
export async function lynxClearTokenCache(): Promise<void> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("nayax_token_cache")
    .delete()
    .eq("id", "default");
}

async function lynxFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  // Lynx acepta el token bajo distintos nombres de header dependiendo de la
  // versión / configuración. Probamos en orden hasta que uno responda 2xx.
  const variantes: HeadersInit[] = [
    { Token: token },
    { Authorization: `Bearer ${token}` },
    { Authorization: token },
    { "X-Token": token },
  ];

  let lastStatus = 0;
  let lastBody = "";

  for (const headers of variantes) {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...headers,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (res.ok) {
      return (await res.json()) as T;
    }
    lastStatus = res.status;
    lastBody = await res.text().catch(() => "");
    // Si es 401/403, intentamos siguiente variante. Si es otro error, paramos.
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(
        `Lynx ${path} falló (${res.status}): ${lastBody || res.statusText}`,
      );
    }
  }

  throw new Error(
    `Lynx ${path} sigue fallando después de probar todas las variantes de header (último ${lastStatus}): ${lastBody}`,
  );
}

/**
 * Lista máquinas con paginación. Trae hasta `limit` máquinas desde `offset`.
 * Lynx tiene un límite de 1000 resultados por request.
 */
export async function lynxListMachines(
  token: string,
  limit = 200,
  offset = 0,
): Promise<LynxMachine[]> {
  return lynxFetch<LynxMachine[]>(
    token,
    `/v1/machines?ResultsLimit=${limit}&ResultsOffset=${offset}`,
  );
}

/**
 * Trae todas las máquinas iterando paginación hasta acabar.
 */
export async function lynxListAllMachines(
  token: string,
): Promise<LynxMachine[]> {
  const all: LynxMachine[] = [];
  const pageSize = 200;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await lynxListMachines(token, pageSize, offset);
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
    if (offset > 10000) break; // safety: 10k máquinas máximo
  }
  return all;
}

export async function lynxListMachineProducts(
  token: string,
  machineId: number,
): Promise<LynxMachineProduct[]> {
  return lynxFetch<LynxMachineProduct[]>(
    token,
    `/v1/machine/${machineId}/machineProducts`,
  );
}
