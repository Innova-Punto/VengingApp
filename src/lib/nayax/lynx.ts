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
  // Lynx acepta el token en header "Token" (no en Authorization: Bearer).
  // Si retorna 401 con ese header, probamos Authorization: Bearer como fallback.
  const tryFetch = async (headers: HeadersInit) => {
    return fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...headers,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
  };

  let res = await tryFetch({ Token: token });

  // Fallback: si Token header no funciona, probar Bearer
  if (res.status === 401) {
    res = await tryFetch({ Authorization: `Bearer ${token}` });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Lynx ${path} falló (${res.status}): ${text || res.statusText}`,
    );
  }
  return (await res.json()) as T;
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
