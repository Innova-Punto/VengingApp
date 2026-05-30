"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion", "almacen"] as const;

export type EncResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

export async function crearEncartuchado(
  _prev: EncResult | null,
  formData: FormData,
): Promise<EncResult> {
  const current = await requireRole(...ROLES);

  const producto_id = String(formData.get("producto_id") ?? "");
  const cartuchosRaw = formData.get("cartuchos_producidos");
  const gramosPorCartuchoRaw = formData.get("gramos_por_cartucho");
  const mermaRaw = formData.get("gramos_merma");
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!producto_id) return { ok: false, message: "Selecciona un producto." };

  const cartuchos_producidos = Number(cartuchosRaw);
  if (!Number.isInteger(cartuchos_producidos) || cartuchos_producidos <= 0) {
    return { ok: false, message: "Cartuchos a producir debe ser entero > 0." };
  }

  const gramos_por_cartucho = Number(gramosPorCartuchoRaw);
  if (!Number.isInteger(gramos_por_cartucho) || gramos_por_cartucho <= 0) {
    return { ok: false, message: "Gramos por cartucho debe ser entero > 0." };
  }

  let gramos_merma = 0;
  if (mermaRaw && String(mermaRaw).trim() !== "") {
    const n = Number(mermaRaw);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, message: "Merma debe ser entero ≥ 0." };
    }
    gramos_merma = n;
  }

  const gramos_totales_consumidos =
    cartuchos_producidos * gramos_por_cartucho + gramos_merma;

  const supabase = createClient();

  // Verificar que el producto sea de tipo polvo
  const { data: producto } = await supabase
    .from("productos")
    .select("id, tipo")
    .eq("id", producto_id)
    .maybeSingle();
  if (!producto) return { ok: false, message: "Producto no existe." };
  if (producto.tipo !== "polvo") {
    return {
      ok: false,
      message: "Solo se pueden encartuchar productos de tipo polvo.",
    };
  }

  // PEPS: pickear lotes — usa service_role para llamar la SECURITY DEFINER fn
  type PepsPick = {
    lote_id: string;
    gramos_a_consumir: number;
    costo_por_gramo: number;
  };
  // pick_lote_peps_granel está SECURITY DEFINER con grant a authenticated;
  // la llamamos con cast porque el typegen no la expone.
  const { data: picksRaw, error: pepsErr } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "pick_lote_peps_granel",
    {
      p_producto_id: producto_id,
      p_gramos_requeridos: gramos_totales_consumidos,
    },
  );

  if (pepsErr) {
    return {
      ok: false,
      message: pepsErr.message.replace(/^.*ERROR:\s*/, ""),
    };
  }
  const picks = (picksRaw as unknown as PepsPick[] | null) ?? [];
  if (picks.length === 0) {
    return {
      ok: false,
      message: "No hay stock disponible para este producto.",
    };
  }

  // Calcula costo promedio g
  let valor_total = 0;
  for (const p of picks) {
    valor_total += Number(p.gramos_a_consumir) * Number(p.costo_por_gramo);
  }
  const costo_promedio_g =
    valor_total / Math.max(1, gramos_totales_consumidos);

  // Crea cabecera
  const { data: enc, error: encErr } = await supabase
    .from("encartuchados")
    .insert({
      folio: "",
      producto_id,
      cartuchos_producidos,
      gramos_por_cartucho,
      gramos_totales_consumidos,
      gramos_merma,
      costo_promedio_g: Math.round(costo_promedio_g * 1_000_000) / 1_000_000,
      cantidad_disponible: cartuchos_producidos,
      operario_id: current.id,
      notas,
    })
    .select("id, folio")
    .single();

  if (encErr || !enc) {
    return { ok: false, message: encErr?.message ?? "No se pudo crear el encartuchado." };
  }

  // Inserta encartuchado_lotes (dispara el trigger: reduce granel + kardex salida)
  for (const p of picks) {
    const valor_aportado =
      Math.round(
        Number(p.gramos_a_consumir) * Number(p.costo_por_gramo) * 100,
      ) / 100;
    const { error: itemErr } = await supabase
      .from("encartuchado_lotes")
      .insert({
        encartuchado_id: enc.id,
        lote_id: p.lote_id,
        gramos_consumidos: p.gramos_a_consumir,
        costo_por_gramo_lote: p.costo_por_gramo,
        valor_aportado,
      });
    if (itemErr) {
      return {
        ok: false,
        message: `Error al consumir lote: ${itemErr.message}`,
      };
    }
  }

  // Inserta kardex: entrada de cartuchos y merma (si aplica)
  const valorCartuchos =
    Math.round(
      cartuchos_producidos *
        gramos_por_cartucho *
        costo_promedio_g *
        100,
    ) / 100;
  await supabase.from("movimientos_inventario").insert({
    tipo: "encartuchado_entrada_cartucho",
    producto_id,
    encartuchado_id: enc.id,
    presentacion: "cartucho",
    cantidad_cartuchos: cartuchos_producidos,
    gramos: cartuchos_producidos * gramos_por_cartucho,
    costo_por_gramo_snapshot: costo_promedio_g,
    valor_movimiento: valorCartuchos,
    referencia_tabla: "encartuchados",
    referencia_id: enc.id,
  });

  if (gramos_merma > 0) {
    const valorMerma =
      Math.round(gramos_merma * costo_promedio_g * 100) / 100;
    await supabase.from("movimientos_inventario").insert({
      tipo: "merma_encartuchado",
      producto_id,
      encartuchado_id: enc.id,
      presentacion: "granel",
      gramos: -gramos_merma,
      costo_por_gramo_snapshot: costo_promedio_g,
      valor_movimiento: -valorMerma,
      referencia_tabla: "encartuchados",
      referencia_id: enc.id,
    });
  }

  revalidatePath("/almacen/encartuchados");
  revalidatePath("/almacen/lotes");
  redirect(`/almacen/encartuchados/${enc.id}`);
}
