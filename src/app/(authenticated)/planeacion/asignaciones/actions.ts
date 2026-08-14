"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type AsigEstado = Database["public"]["Enums"]["asignacion_estado"];
type ExcMotivo = Database["public"]["Enums"]["excepcion_motivo"];

const ROLES = ["admin", "direccion", "planeador"] as const;

// ============================================================================
// Asignación
// ============================================================================

export type AsigResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

export async function crearAsignacion(
  _prev: AsigResult | null,
  formData: FormData,
): Promise<AsigResult> {
  const current = await requireRole(...ROLES);

  const fecha = String(formData.get("fecha") ?? "").trim();
  const ruta_id = String(formData.get("ruta_id") ?? "");
  const operador_id = String(formData.get("operador_id") ?? "");
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!fecha) return { ok: false, message: "Selecciona la fecha." };
  if (!ruta_id) return { ok: false, message: "Selecciona la ruta." };
  if (!operador_id)
    return { ok: false, message: "Selecciona el operador." };

  const supabase = createClient();

  const { data: asig, error } = await supabase
    .from("asignaciones_diarias")
    .insert({
      fecha,
      ruta_id,
      operador_id,
      notas,
      creado_por: current.id,
      estado: "planeada",
    })
    .select("id")
    .single();

  if (error || !asig) {
    if (error?.code === "23505") {
      return {
        ok: false,
        message: "Esa ruta ya tiene una asignación para esa fecha.",
      };
    }
    return { ok: false, message: error?.message ?? "Error" };
  }

  // Copiar las máquinas base de la ruta a la asignación
  const { data: rutaMaquinas } = await supabase
    .from("ruta_maquinas")
    .select("maquina_id, orden")
    .eq("ruta_id", ruta_id)
    .order("orden");

  if (rutaMaquinas && rutaMaquinas.length > 0) {
    const rows = rutaMaquinas.map((rm) => ({
      asignacion_id: asig.id,
      maquina_id: rm.maquina_id,
      orden: rm.orden,
      origen: "base_ruta" as const,
    }));
    const { error: insErr } = await supabase
      .from("asignacion_maquinas")
      .insert(rows);
    if (insErr) {
      return {
        ok: false,
        message: `Asignación creada pero al copiar máquinas: ${insErr.message}`,
      };
    }
  }

  revalidatePath("/planeacion/asignaciones");
  redirect(`/planeacion/asignaciones/${asig.id}`);
}

// ============================================================================
// Asignación dinámica (ruteo por prioridad — el sistema propone, Mariana dispone)
// ============================================================================

export type GrupoDinamico = {
  operador_id: string;
  /** IDs de máquinas en el orden de visita elegido. */
  maquina_ids: string[];
};

/**
 * Crea una asignación por operador con las máquinas confirmadas de la
 * propuesta dinámica. Usa EXACTAMENTE las mismas tablas que crearAsignacion
 * (asignaciones_diarias + asignacion_maquinas) para que surtido, PWA y
 * jornadas no cambien en nada; la única diferencia es
 * origen = 'sugerencia_dinamica' (KPI para comparar vs modo estático).
 *
 * La ruta de la asignación es la más representada entre las máquinas
 * seleccionadas del operador (el modelo exige ruta_id y única por fecha);
 * las máquinas de su otra ruta viajan en la misma asignación como parte de
 * su zona.
 */
export async function crearAsignacionDinamica(input: {
  fecha: string;
  grupos: GrupoDinamico[];
}): Promise<AsigResult> {
  const current = await requireRole(...ROLES);

  const fecha = (input.fecha ?? "").slice(0, 10);
  if (!fecha) return { ok: false, message: "Falta la fecha." };
  const grupos = (input.grupos ?? []).filter(
    (g) => g.operador_id && (g.maquina_ids?.length ?? 0) > 0,
  );
  if (grupos.length === 0) {
    return { ok: false, message: "No hay máquinas seleccionadas." };
  }

  const supabase = createClient();
  const creadas: string[] = [];

  for (const grupo of grupos) {
    // Ruta de la asignación: la más frecuente entre las máquinas elegidas
    // (consultada en servidor — no se confía en el payload del cliente).
    const { data: rutasDe } = await supabase
      .from("ruta_maquinas")
      .select("ruta_id, maquina_id, ruta:rutas(id, nombre, activa)")
      .in("maquina_id", grupo.maquina_ids);

    const conteo = new Map<string, { n: number; nombre: string }>();
    for (const rm of rutasDe ?? []) {
      const ruta = Array.isArray(rm.ruta) ? rm.ruta[0] : rm.ruta;
      if (!ruta?.activa) continue;
      const prev = conteo.get(rm.ruta_id) ?? { n: 0, nombre: ruta.nombre };
      conteo.set(rm.ruta_id, { n: prev.n + 1, nombre: ruta.nombre });
    }
    const rutaGanadora = Array.from(conteo.entries()).sort(
      (a, b) => b[1].n - a[1].n,
    )[0];
    if (!rutaGanadora) {
      return {
        ok: false,
        message:
          "Las máquinas seleccionadas de un operador no pertenecen a ninguna ruta activa.",
      };
    }
    const [ruta_id, rutaInfo] = rutaGanadora;

    const { data: asig, error } = await supabase
      .from("asignaciones_diarias")
      .insert({
        fecha,
        ruta_id,
        operador_id: grupo.operador_id,
        notas: "Asignación dinámica (propuesta por prioridad)",
        creado_por: current.id,
        estado: "planeada",
      })
      .select("id")
      .single();

    if (error || !asig) {
      if (error?.code === "23505") {
        return {
          ok: false,
          message: `La ruta ${rutaInfo.nombre} ya tiene asignación el ${fecha}. Cancélala primero o quita a ese operador de la propuesta. (Se crearon ${creadas.length} asignaciones antes de este error.)`,
        };
      }
      return { ok: false, message: error?.message ?? "Error al crear asignación." };
    }

    const rows = grupo.maquina_ids.map((maquina_id, idx) => ({
      asignacion_id: asig.id,
      maquina_id,
      orden: idx + 1,
      origen: "sugerencia_dinamica" as const,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any)
      .from("asignacion_maquinas")
      .insert(rows);
    if (insErr) {
      return {
        ok: false,
        message: `Asignación creada pero al copiar máquinas: ${insErr.message}`,
      };
    }
    creadas.push(asig.id);
  }

  revalidatePath("/planeacion/asignaciones");
  revalidatePath("/planeacion/emergencias");
  return {
    ok: true,
    message: `${creadas.length} asignación(es) dinámica(s) creada(s) para el ${fecha}.`,
  };
}

export async function actualizarNotasAsig(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const notas = String(formData.get("notas") ?? "").trim() || null;
  if (!id) redirect("/planeacion/asignaciones");
  const supabase = createClient();
  await supabase.from("asignaciones_diarias").update({ notas }).eq("id", id);
  revalidatePath(`/planeacion/asignaciones/${id}`);
  redirect(`/planeacion/asignaciones/${id}`);
}

export async function cambiarEstadoAsig(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "") as AsigEstado;
  if (!id) redirect("/planeacion/asignaciones");

  const validos: AsigEstado[] = [
    "planeada",
    "surtida",
    "en_jornada",
    "completada",
    "cancelada",
  ];
  if (!validos.includes(estado))
    redirect(`/planeacion/asignaciones/${id}`);

  const supabase = createClient();

  // Cancelar una ruta planeada/surtida debe reintegrar el surtido al almacén.
  if (estado === "cancelada") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("cancelar_ruta_surtida", {
      p_asignacion_id: id,
      p_motivo: "Cancelada por administración. Surtido reintegrado al almacén.",
    });
  } else {
    await supabase
      .from("asignaciones_diarias")
      .update({ estado })
      .eq("id", id);
  }

  revalidatePath("/planeacion/asignaciones");
  revalidatePath(`/planeacion/asignaciones/${id}`);
  revalidatePath("/almacen/inventario");
  redirect(`/planeacion/asignaciones/${id}`);
}

// ============================================================================
// Máquinas dentro de la asignación
// ============================================================================

export type AsigMaqResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function agregarMaquinaExcepcion(
  _prev: AsigMaqResult | null,
  formData: FormData,
): Promise<AsigMaqResult> {
  await requireRole(...ROLES);

  const asignacion_id = String(formData.get("asignacion_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");
  const motivoRaw = String(formData.get("motivo_excepcion") ?? "");
  const notas = String(formData.get("notas") ?? "").trim() || null;
  const ordenRaw = formData.get("orden");

  if (!asignacion_id || !maquina_id) {
    return { ok: false, message: "Falta asignación o máquina." };
  }

  const motivosValidos: ExcMotivo[] = [
    "ausencia_operador",
    "emergencia",
    "mantenimiento",
    "otro",
  ];
  if (!motivosValidos.includes(motivoRaw as ExcMotivo)) {
    return { ok: false, message: "Motivo de excepción inválido." };
  }

  const orden = ordenRaw && String(ordenRaw).trim() !== ""
    ? Number(ordenRaw)
    : 99;

  const supabase = createClient();
  const { error } = await supabase.from("asignacion_maquinas").insert({
    asignacion_id,
    maquina_id,
    orden,
    origen: "agregada_excepcion",
    motivo_excepcion: motivoRaw as ExcMotivo,
    notas,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: "Esta máquina ya está en la asignación.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/planeacion/asignaciones/${asignacion_id}`);
  return { ok: true, message: "Máquina agregada." };
}

export async function quitarMaquinaDeAsig(formData: FormData) {
  await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const asignacion_id = String(formData.get("asignacion_id") ?? "");
  if (!id || !asignacion_id) redirect("/planeacion/asignaciones");

  const supabase = createClient();
  // RPC que también borra surtido_items de la máquina y reintegra inventario
  // al encartuchado/lote si el PEPS ya se había aplicado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  await supabaseAny.rpc("quitar_maquina_de_asignacion", {
    p_asignacion_maquina_id: id,
  });

  revalidatePath(`/planeacion/asignaciones/${asignacion_id}`);
  redirect(`/planeacion/asignaciones/${asignacion_id}`);
}
