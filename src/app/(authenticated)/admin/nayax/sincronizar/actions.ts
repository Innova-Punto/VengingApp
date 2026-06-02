"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  lynxGetToken,
  lynxListAllMachines,
  lynxListMachineProducts,
  type LynxMachine,
  type LynxMachineProduct,
} from "@/lib/nayax/lynx";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult<T = undefined> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string };

/**
 * Prueba la conexión a Lynx haciendo login.
 */
export async function probarConexionLynx(): Promise<ActionResult> {
  await requireRole("admin", "direccion");
  try {
    const token = await lynxGetToken();
    return {
      ok: true,
      message: `Conexión OK. Token de ${token.slice(0, 16)}...`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export type SnapshotMaquina = {
  nayax: LynxMachine;
  productos: LynxMachineProduct[];
  /** Sugerencia automática de máquina local: hace match por nayax_machine_id ya capturado o por número/serie. */
  sugerencia_local_id: string | null;
  sugerencia_razon: string | null;
};

export type SnapshotLocal = {
  id: string;
  serie: string;
  alias: string | null;
  nayax_machine_id: string | null;
  tolvas: { id: string; numero: number; nayax_item_code: string | null }[];
};

export type Ubicacion = {
  id: string;
  nombre: string;
  cliente_nombre: string;
};

export type ProductoNayax = {
  /** Único: NayaxProductID si existe, fallback DEXProductName + PACode */
  key: string;
  nayax_product_id: number | null;
  dex_name: string;
  pa_code_ejemplo: string | null;
  precio_sugerido: number | null;
  /** Si ya existe en BD local: id local */
  local_id: string | null;
  local_sku: string | null;
  match_razon: string | null;
  /** SKU candidato propuesto si no existe local */
  sku_sugerido: string;
};

export type Snapshot = {
  maquinas_nayax: SnapshotMaquina[];
  maquinas_locales: SnapshotLocal[];
  ubicaciones: Ubicacion[];
  productos_nayax: ProductoNayax[];
};

/**
 * Trae todas las máquinas de Nayax con sus productos, las máquinas locales
 * con tolvas, y sugiere matches automáticos.
 */
export async function obtenerSnapshot(): Promise<ActionResult<Snapshot>> {
  await requireRole("admin", "direccion");
  try {
    const supabase = createAdminClient();

    // 1. Máquinas locales con tolvas
    const { data: maquinasLocales } = await supabase
      .from("maquinas")
      .select(
        `id, serie, alias, nayax_machine_id, activo,
         tolvas(id, numero, nayax_item_code)`,
      )
      .eq("activo", true);

    const locales: SnapshotLocal[] = (maquinasLocales ?? []).map((m) => ({
      id: m.id,
      serie: m.serie,
      alias: m.alias ?? null,
      nayax_machine_id: m.nayax_machine_id ?? null,
      tolvas: (Array.isArray(m.tolvas) ? m.tolvas : []).map((t) => ({
        id: t.id,
        numero: t.numero,
        nayax_item_code: t.nayax_item_code ?? null,
      })),
    }));

    // 2. Lynx: token + máquinas + productos
    const token = await lynxGetToken();
    const maquinasNayax = await lynxListAllMachines(token);

    const conProductos: SnapshotMaquina[] = [];
    for (const m of maquinasNayax) {
      let productos: LynxMachineProduct[] = [];
      try {
        productos = await lynxListMachineProducts(token, m.MachineID);
      } catch {
        productos = [];
      }

      // Sugerencia de match
      let sugerencia_local_id: string | null = null;
      let sugerencia_razon: string | null = null;
      const yaCapturado = locales.find(
        (l) => l.nayax_machine_id === String(m.MachineID),
      );
      if (yaCapturado) {
        sugerencia_local_id = yaCapturado.id;
        sugerencia_razon = "ya tiene nayax_machine_id";
      } else {
        const porSerie = locales.find(
          (l) =>
            l.serie === m.MachineNumber ||
            l.serie === m.SerialNumber ||
            l.serie === m.DeviceSerialNumber,
        );
        if (porSerie) {
          sugerencia_local_id = porSerie.id;
          sugerencia_razon = "serie coincide";
        } else {
          const porNombre = locales.find(
            (l) =>
              !!m.MachineName &&
              (l.alias?.toLowerCase() === m.MachineName.toLowerCase() ||
                l.serie.toLowerCase() === m.MachineName.toLowerCase()),
          );
          if (porNombre) {
            sugerencia_local_id = porNombre.id;
            sugerencia_razon = "nombre coincide";
          }
        }
      }

      conProductos.push({
        nayax: m,
        productos,
        sugerencia_local_id,
        sugerencia_razon,
      });
    }

    // Ubicaciones disponibles (para crear máquinas nuevas)
    const { data: ubicacionesRaw } = await supabase
      .from("ubicaciones")
      .select("id, nombre, cliente:clientes(nombre)")
      .eq("activo", true)
      .order("nombre");
    const ubicaciones: Ubicacion[] = (ubicacionesRaw ?? []).map((u) => {
      const cli = Array.isArray(u.cliente) ? u.cliente[0] : u.cliente;
      return {
        id: u.id,
        nombre: u.nombre,
        cliente_nombre: cli?.nombre ?? "(sin cliente)",
      };
    });

    // Productos locales actuales (para detectar matches)
    const { data: productosLocales } = await supabase
      .from("productos")
      .select("id, sku, nombre")
      .eq("activo", true);

    // Recolecta productos únicos de Nayax desde MachineProducts
    const productosNayaxMap = new Map<string, ProductoNayax>();
    for (const mn of conProductos) {
      for (const p of mn.productos) {
        // Identificador único: NayaxProductID si existe; sino DEXProductName + PACode
        const key = p.NayaxProductID
          ? `nayax-${p.NayaxProductID}`
          : `name-${(p.DEXProductName ?? "").toLowerCase()}-${p.PACode ?? ""}`;
        if (productosNayaxMap.has(key)) continue;

        const dexName = p.DEXProductName ?? "(sin nombre)";
        const precio =
          p.RetailPrice ?? p.MachinePrice ?? p.CashPrice ?? null;

        // Match con producto local: por nombre exacto (case-insensitive)
        const matchLocal = (productosLocales ?? []).find(
          (pl) => pl.nombre.toLowerCase() === dexName.toLowerCase(),
        );

        // SKU candidato: prefijo NX-{id} o slug del nombre
        let skuCandidato = "";
        if (p.NayaxProductID) {
          skuCandidato = `NX-${p.NayaxProductID}`;
        } else {
          skuCandidato = dexName
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 20);
        }

        productosNayaxMap.set(key, {
          key,
          nayax_product_id: p.NayaxProductID ?? null,
          dex_name: dexName,
          pa_code_ejemplo: p.PACode ?? null,
          precio_sugerido: precio != null ? Number(precio) : null,
          local_id: matchLocal?.id ?? null,
          local_sku: matchLocal?.sku ?? null,
          match_razon: matchLocal ? "nombre coincide" : null,
          sku_sugerido: skuCandidato,
        });
      }
    }
    const productos_nayax: ProductoNayax[] = Array.from(
      productosNayaxMap.values(),
    ).sort((a, b) => a.dex_name.localeCompare(b.dex_name));

    return {
      ok: true,
      message: `${conProductos.length} máquinas Nayax · ${locales.length} máquinas locales · ${productos_nayax.length} productos únicos en Nayax.`,
      data: {
        maquinas_nayax: conProductos,
        maquinas_locales: locales,
        ubicaciones,
        productos_nayax,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Crea localmente máquinas que existen en Nayax pero no aquí.
 * Cada máquina queda en estado 'mantenimiento' con tolvas vacías
 * (el trigger trg_maquina_create_tolvas las crea automáticamente).
 * El admin completa producto/gramaje/precio por tolva después.
 *
 * Defaults configurables por la operación:
 *   num_tolvas: 8
 *   capacidad_max_tolva_g: 1500
 *   frecuencia_visita_dias: 3 (≈ 2 veces por semana)
 *   vaso_capacidad_max: 200
 */
export async function autoCrearMaquinas(input: {
  items: {
    nayaxMachineId: number;
    machineNumber: string | null;
    machineName: string | null;
    serialNumber: string | null;
    ubicacionId: string;
  }[];
}): Promise<ActionResult<{ creadas: number; errores: string[] }>> {
  await requireRole("admin", "direccion");
  if (input.items.length === 0) {
    return { ok: false, message: "Selecciona al menos una máquina." };
  }

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  let creadas = 0;
  const errores: string[] = [];

  for (const it of input.items) {
    // Serie: MachineNumber, fallback SerialNumber, fallback NAYAX-{id}
    let serie =
      it.machineNumber?.trim() ||
      it.serialNumber?.trim() ||
      `NAYAX-${it.nayaxMachineId}`;

    // Evita choque de UNIQUE serie
    const { data: existing } = await supabaseAny
      .from("maquinas")
      .select("id")
      .eq("serie", serie)
      .maybeSingle();
    if (existing) {
      serie = `${serie}-${it.nayaxMachineId}`;
    }

    const insert = {
      serie,
      alias: it.machineName ?? null,
      ubicacion_id: it.ubicacionId,
      num_tolvas: 8,
      capacidad_max_tolva_g: 1500,
      frecuencia_visita_dias: 3,
      vaso_capacidad_max: 200,
      estado: "mantenimiento",
      activo: true,
      nayax_machine_id: String(it.nayaxMachineId),
      nayax_serial: it.serialNumber ?? null,
      notas: `Importada automáticamente desde Nayax (Lynx) el ${new Date().toISOString().slice(0, 10)}. Pendiente: asignar producto + gramaje + precio en cada tolva.`,
    };

    const { error } = await supabaseAny.from("maquinas").insert(insert);
    if (error) {
      errores.push(`#${it.nayaxMachineId} (${serie}): ${error.message}`);
    } else {
      creadas += 1;
    }
  }

  revalidatePath("/admin/maquinas", "layout");
  revalidatePath("/admin/nayax", "layout");

  if (errores.length > 0 && creadas === 0) {
    return { ok: false, message: errores.join(" · ") };
  }
  return {
    ok: true,
    message: `${creadas} máquina(s) creada(s) en estado mantenimiento. Completa producto y gramaje en cada tolva.`,
    data: { creadas, errores },
  };
}

/**
 * Crea productos locales desde la lista de productos Nayax.
 * El admin elige SKU, tipo (polvo/vaso), gramaje y precio.
 */
export async function autoCrearProductos(input: {
  items: {
    sku: string;
    nombre: string;
    tipo: "polvo" | "vaso";
    gramaje_servicio_default: number | null;
    precio_venta_default: number | null;
    notas: string;
  }[];
}): Promise<ActionResult<{ creados: number; errores: string[] }>> {
  await requireRole("admin", "direccion");
  if (input.items.length === 0) {
    return { ok: false, message: "Selecciona al menos un producto." };
  }

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  let creados = 0;
  const errores: string[] = [];

  for (const it of input.items) {
    if (!it.sku.trim() || !it.nombre.trim()) {
      errores.push(`${it.nombre || "?"}: falta SKU o nombre`);
      continue;
    }
    if (it.tipo === "polvo" && (!it.gramaje_servicio_default || it.gramaje_servicio_default <= 0)) {
      errores.push(`${it.sku}: producto polvo requiere gramaje > 0`);
      continue;
    }

    const insert = {
      sku: it.sku.trim().toUpperCase(),
      nombre: it.nombre.trim(),
      tipo: it.tipo,
      gramaje_servicio_default: it.gramaje_servicio_default,
      precio_venta_default: it.precio_venta_default,
      activo: true,
      notas: it.notas || "Importado desde Nayax (Lynx)",
    };

    const { error } = await supabaseAny.from("productos").insert(insert);
    if (error) {
      if (error.code === "23505") {
        errores.push(`${it.sku}: SKU ya existe`);
      } else {
        errores.push(`${it.sku}: ${error.message}`);
      }
    } else {
      creados += 1;
    }
  }

  revalidatePath("/admin/productos", "layout");
  revalidatePath("/admin/nayax", "layout");

  if (errores.length > 0 && creados === 0) {
    return { ok: false, message: errores.join(" · ") };
  }
  return {
    ok: true,
    message: `${creados} producto(s) creado(s).`,
    data: { creados, errores },
  };
}

/**
 * Aplica el mapeo: por cada pareja (maquina_local_id, machine_id_nayax)
 * actualiza maquinas.nayax_machine_id. Por cada (tolva_id, pa_code)
 * actualiza tolvas.nayax_item_code.
 */
export async function aplicarMapeo(input: {
  maquinas: { localId: string; nayaxMachineId: string }[];
  tolvas: { tolvaId: string; paCode: string }[];
}): Promise<ActionResult> {
  await requireRole("admin", "direccion");
  try {
    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAny = supabase as any;
    let mAct = 0;
    let tAct = 0;
    const errs: string[] = [];

    for (const m of input.maquinas) {
      const { error } = await supabaseAny
        .from("maquinas")
        .update({ nayax_machine_id: m.nayaxMachineId })
        .eq("id", m.localId);
      if (error) errs.push(`maquina ${m.localId}: ${error.message}`);
      else mAct += 1;
    }

    for (const t of input.tolvas) {
      const { error } = await supabaseAny
        .from("tolvas")
        .update({ nayax_item_code: t.paCode })
        .eq("id", t.tolvaId);
      if (error) errs.push(`tolva ${t.tolvaId}: ${error.message}`);
      else tAct += 1;
    }

    revalidatePath("/admin/maquinas", "layout");
    revalidatePath("/admin/nayax", "layout");

    if (errs.length > 0) {
      return {
        ok: false,
        message: `Aplicado parcial: ${mAct} máquinas, ${tAct} tolvas. Errores: ${errs
          .slice(0, 5)
          .join(" · ")}`,
      };
    }
    return {
      ok: true,
      message: `${mAct} máquinas y ${tAct} tolvas actualizadas.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
