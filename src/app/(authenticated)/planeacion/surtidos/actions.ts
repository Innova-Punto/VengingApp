"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = ["admin", "direccion", "planeador", "almacen"] as const;

// ============================================================================
// Generar surtido sugerido a partir de una asignación
// ============================================================================

export type SurtidoResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

type Sugerido = {
  maquina_id: string;
  producto_id: string;
  cartuchos: number;
  vasos: number;
};

export async function generarSurtido(formData: FormData): Promise<void> {
  const current = await requireRole(...ROLES);

  const asignacion_id = String(formData.get("asignacion_id") ?? "");
  if (!asignacion_id) redirect("/planeacion/asignaciones");

  const supabase = createClient();

  // Validar que la asignación esté planeada y no tenga surtido todavía
  const { data: asig } = await supabase
    .from("asignaciones_diarias")
    .select("id, estado")
    .eq("id", asignacion_id)
    .maybeSingle();
  if (!asig) redirect("/planeacion/asignaciones");
  if (asig.estado !== "planeada") {
    redirect(`/planeacion/asignaciones/${asignacion_id}?error=estado_no_planeada`);
  }

  const { data: existente } = await supabase
    .from("surtidos")
    .select("id")
    .eq("asignacion_id", asignacion_id)
    .maybeSingle();
  if (existente) {
    redirect(`/planeacion/surtidos/${existente.id}`);
  }

  // Trae todas las máquinas de la asignación con su info de tolvas y vaso
  const { data: asigMaquinas } = await supabase
    .from("asignacion_maquinas")
    .select(
      `maquina_id,
       maquina:maquinas(
         id, capacidad_max_tolva_g,
         vaso_producto_id, vaso_capacidad_max, vaso_inventario_actual,
         tolvas:tolvas(
           id, numero, producto_id, gramaje_servicio,
           capacidad_max_g, inventario_actual_g
         )
       )`,
    )
    .eq("asignacion_id", asignacion_id);

  // Calcula sugerido por (maquina, producto)
  const sugeridoMap = new Map<string, Sugerido>();
  const key = (m: string, p: string) => `${m}|${p}`;

  for (const am of asigMaquinas ?? []) {
    const maquina = Array.isArray(am.maquina) ? am.maquina[0] : am.maquina;
    if (!maquina) continue;

    // Polvos: por cada tolva con producto, calcular cartuchos faltantes
    const tolvas = Array.isArray(maquina.tolvas) ? maquina.tolvas : [];
    for (const t of tolvas) {
      if (!t.producto_id) continue;
      const gramajeCartucho = 400; // default; idealmente lo traemos del producto
      const espacioG = Math.max(
        0,
        (t.capacidad_max_g ?? 2000) - (t.inventario_actual_g ?? 0),
      );
      const cartuchos = Math.floor(espacioG / gramajeCartucho);
      if (cartuchos <= 0) continue;

      const k = key(maquina.id, t.producto_id);
      const prev = sugeridoMap.get(k) ?? {
        maquina_id: maquina.id,
        producto_id: t.producto_id,
        cartuchos: 0,
        vasos: 0,
      };
      prev.cartuchos += cartuchos;
      sugeridoMap.set(k, prev);
    }

    // Vasos: una sola fila por máquina con el producto de vaso
    if (maquina.vaso_producto_id) {
      const vasosFaltan = Math.max(
        0,
        (maquina.vaso_capacidad_max ?? 0) -
          (maquina.vaso_inventario_actual ?? 0),
      );
      if (vasosFaltan > 0) {
        const k = key(maquina.id, maquina.vaso_producto_id);
        const prev = sugeridoMap.get(k) ?? {
          maquina_id: maquina.id,
          producto_id: maquina.vaso_producto_id,
          cartuchos: 0,
          vasos: 0,
        };
        prev.vasos += vasosFaltan;
        sugeridoMap.set(k, prev);
      }
    }
  }

  const items = Array.from(sugeridoMap.values()).filter(
    (s) => s.cartuchos > 0 || s.vasos > 0,
  );

  // Crea cabecera de surtido
  const { data: surt, error: surtErr } = await supabase
    .from("surtidos")
    .insert({
      folio: "",
      asignacion_id,
      creado_por: current.id,
      estado: "pendiente",
    })
    .select("id")
    .single();

  if (surtErr || !surt) {
    redirect(`/planeacion/asignaciones/${asignacion_id}?error=surtido`);
  }

  // Inserta los items
  if (items.length > 0) {
    const rows = items.map((it) => ({
      surtido_id: surt.id,
      maquina_id: it.maquina_id,
      producto_id: it.producto_id,
      cartuchos_sugeridos: it.cartuchos,
      cartuchos_entregados: it.cartuchos,
      vasos_sugeridos: it.vasos,
      vasos_entregados: it.vasos,
    }));
    await supabase.from("surtido_items").insert(rows);
  }

  revalidatePath(`/planeacion/asignaciones/${asignacion_id}`);
  revalidatePath("/planeacion/surtidos");
  redirect(`/planeacion/surtidos/${surt.id}`);
}

// ============================================================================
// Editar cantidades del surtido
// ============================================================================

export type ItemResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function actualizarSurtidoItem(
  _prev: ItemResult | null,
  formData: FormData,
): Promise<ItemResult> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  const surtido_id = String(formData.get("surtido_id") ?? "");
  const cartuchosRaw = formData.get("cartuchos_entregados");
  const vasosRaw = formData.get("vasos_entregados");

  if (!id || !surtido_id) {
    return { ok: false, message: "Falta id." };
  }

  const cartuchos = Number(cartuchosRaw ?? 0);
  const vasos = Number(vasosRaw ?? 0);
  if (!Number.isInteger(cartuchos) || cartuchos < 0) {
    return { ok: false, message: "Cartuchos entregados debe ser entero ≥ 0." };
  }
  if (!Number.isInteger(vasos) || vasos < 0) {
    return { ok: false, message: "Vasos entregados debe ser entero ≥ 0." };
  }

  const supabase = createClient();
  const { data: surt } = await supabase
    .from("surtidos")
    .select("estado")
    .eq("id", surtido_id)
    .maybeSingle();
  if (!surt) return { ok: false, message: "Surtido no encontrado." };
  if (surt.estado === "completado") {
    return {
      ok: false,
      message: "El surtido ya está completado y no admite cambios.",
    };
  }

  const { error } = await supabase
    .from("surtido_items")
    .update({
      cartuchos_entregados: cartuchos,
      vasos_entregados: vasos,
    })
    .eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/planeacion/surtidos/${surtido_id}`);
  return { ok: true, message: "Item actualizado." };
}

// ============================================================================
// Completar surtido: aplica PEPS, descuenta inventario, registra kardex
// ============================================================================

type PepsCartucho = {
  encartuchado_id: string;
  cantidad_tomar: number;
  costo_promedio_g: number;
};

type PepsVaso = {
  lote_id: string;
  cantidad_tomar: number;
  costo_por_unidad: number;
};

export async function completarSurtido(formData: FormData): Promise<void> {
  const current = await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/planeacion/surtidos");

  const supabase = createClient();
  const admin = createAdminClient();

  const { data: surt } = await supabase
    .from("surtidos")
    .select("id, estado, asignacion_id, folio")
    .eq("id", id)
    .maybeSingle();
  if (!surt) redirect("/planeacion/surtidos");
  if (surt.estado === "completado") {
    redirect(`/planeacion/surtidos/${id}`);
  }

  const { data: items } = await supabase
    .from("surtido_items")
    .select(
      `id, maquina_id, producto_id, cartuchos_entregados, vasos_entregados,
       producto:productos(tipo, gramaje_cartucho_default)`,
    )
    .eq("surtido_id", id);

  // Validar y aplicar PEPS por cada item
  type PepsRpc = (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const rpc = admin.rpc as unknown as PepsRpc;

  for (const it of items ?? []) {
    const prod = Array.isArray(it.producto) ? it.producto[0] : it.producto;
    if (!prod) continue;

    if (prod.tipo === "polvo" && (it.cartuchos_entregados ?? 0) > 0) {
      // PEPS sobre encartuchados — toma el más viejo. Asumimos que cabe
      // todo en un solo encartuchado (lo común). Si fuera múltiple,
      // habría que crear múltiples surtido_items.
      const { data: pickedRaw, error: pepsErr } = await rpc(
        "pick_batch_peps_cartucho",
        {
          p_producto_id: it.producto_id,
          p_cartuchos_requeridos: it.cartuchos_entregados,
        },
      );
      if (pepsErr) {
        redirect(
          `/planeacion/surtidos/${id}?error=${encodeURIComponent(pepsErr.message)}`,
        );
      }
      const picked = (pickedRaw as unknown as PepsCartucho[] | null) ?? [];

      // Aplica el primer batch al surtido_item (regla simple: 1 encartuchado)
      const primario = picked[0];
      if (primario) {
        await supabase
          .from("surtido_items")
          .update({ encartuchado_id: primario.encartuchado_id })
          .eq("id", it.id);
      }

      // Descuenta cantidad_disponible y registra kardex por cada batch tomado
      for (const p of picked) {
        const { data: encActual } = await supabase
          .from("encartuchados")
          .select("cantidad_disponible, gramos_por_cartucho")
          .eq("id", p.encartuchado_id)
          .maybeSingle();
        if (!encActual) continue;

        const nuevaCantidad = encActual.cantidad_disponible - p.cantidad_tomar;
        await supabase
          .from("encartuchados")
          .update({ cantidad_disponible: nuevaCantidad })
          .eq("id", p.encartuchado_id);

        const gramosTotales =
          p.cantidad_tomar * encActual.gramos_por_cartucho;
        const valor =
          Math.round(gramosTotales * p.costo_promedio_g * 100) / 100;

        await supabase.from("movimientos_inventario").insert({
          tipo: "surtido_salida_cartucho",
          producto_id: it.producto_id,
          encartuchado_id: p.encartuchado_id,
          maquina_id: it.maquina_id,
          presentacion: "cartucho",
          cantidad_cartuchos: -p.cantidad_tomar,
          gramos: -gramosTotales,
          costo_por_gramo_snapshot: p.costo_promedio_g,
          valor_movimiento: -valor,
          referencia_tabla: "surtido_items",
          referencia_id: it.id,
          usuario_id: current.id,
        });
      }
    }

    if (prod.tipo === "vaso" && (it.vasos_entregados ?? 0) > 0) {
      // PEPS sobre lotes de vasos
      const { data: pickedRaw, error: pepsErr } = await rpc(
        "pick_lote_peps_vaso",
        {
          p_producto_id: it.producto_id,
          p_unidades_requeridas: it.vasos_entregados,
        },
      );
      if (pepsErr) {
        redirect(
          `/planeacion/surtidos/${id}?error=${encodeURIComponent(pepsErr.message)}`,
        );
      }
      const picked = (pickedRaw as unknown as PepsVaso[] | null) ?? [];

      const primario = picked[0];
      if (primario) {
        await supabase
          .from("surtido_items")
          .update({ lote_vaso_id: primario.lote_id })
          .eq("id", it.id);
      }

      for (const p of picked) {
        const { data: loteActual } = await supabase
          .from("lotes")
          .select("unidades_disponibles")
          .eq("id", p.lote_id)
          .maybeSingle();
        if (!loteActual) continue;

        const nuevasUnidades =
          (loteActual.unidades_disponibles ?? 0) - p.cantidad_tomar;
        await supabase
          .from("lotes")
          .update({ unidades_disponibles: nuevasUnidades })
          .eq("id", p.lote_id);

        const valor =
          Math.round(p.cantidad_tomar * p.costo_por_unidad * 100) / 100;

        // No hay tipo 'surtido_salida_vaso' en el enum; usamos
        // 'surtido_salida_cartucho' con presentación 'vaso' para
        // distinguirlo. Refactor futuro.
        await supabase.from("movimientos_inventario").insert({
          tipo: "surtido_salida_cartucho",
          producto_id: it.producto_id,
          lote_id: p.lote_id,
          maquina_id: it.maquina_id,
          presentacion: "vaso",
          cantidad_vasos: -p.cantidad_tomar,
          costo_por_gramo_snapshot: p.costo_por_unidad,
          valor_movimiento: -valor,
          referencia_tabla: "surtido_items",
          referencia_id: it.id,
          usuario_id: current.id,
        });
      }
    }
  }

  // Marca surtido como completado
  await supabase
    .from("surtidos")
    .update({
      estado: "completado",
      surtido_por: current.id,
      fecha_completado: new Date().toISOString(),
    })
    .eq("id", id);

  // Mueve la asignación a estado 'surtida'
  await supabase
    .from("asignaciones_diarias")
    .update({ estado: "surtida" })
    .eq("id", surt.asignacion_id);

  revalidatePath("/planeacion/surtidos");
  revalidatePath(`/planeacion/surtidos/${id}`);
  revalidatePath(`/planeacion/asignaciones/${surt.asignacion_id}`);
  redirect(`/planeacion/surtidos/${id}`);
}
