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

const DEFAULT_BASE = "https://lynx.nayax.com/Operational";

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
 * Obtiene un token bearer de Lynx con 1 hora de expiración.
 * No cacheamos entre invocaciones: Next.js server actions son stateless
 * y un token nuevo es trivial (1 request).
 */
export async function lynxGetToken(): Promise<string> {
  const { usr, pwd } = getCreds();
  const expirationISO = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h

  const res = await fetch(`${baseUrl()}/v1/token/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Usr: usr,
      Pwd: pwd,
      ExpirationUTC: expirationISO,
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
  return body.Token;
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
