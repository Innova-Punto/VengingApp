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

export type Snapshot = {
  maquinas_nayax: SnapshotMaquina[];
  maquinas_locales: SnapshotLocal[];
  ubicaciones: Ubicacion[];
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

    return {
      ok: true,
      message: `${conProductos.length} máquinas Nayax · ${locales.length} máquinas locales.`,
      data: {
        maquinas_nayax: conProductos,
        maquinas_locales: locales,
        ubicaciones,
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
