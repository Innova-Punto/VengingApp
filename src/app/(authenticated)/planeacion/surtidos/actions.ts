"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

  // Trae todas las máquinas de la asignación con su info
  const { data: asigMaquinas } = await supabase
    .from("asignacion_maquinas")
    .select(
      `maquina_id,
       maquina:maquinas(
         id, capacidad_max_tolva_g, frecuencia_visita_dias,
         vaso_producto_id, vaso_capacidad_max, vaso_inventario_actual,
         tolvas:tolvas(
           id, numero, producto_id, gramaje_servicio,
           capacidad_max_g, capacidad_max_g_override, inventario_actual_g
         )
       )`,
    )
    .eq("asignacion_id", asignacion_id);

  // Sustituciones que planeación ya marcó para estas máquinas. La tolva todavía
  // trae el producto saliente (solo cambia cuando el operador lo ejecuta en
  // campo), así que aquí hay que anticiparse: el surtido debe llevar cartuchos
  // del producto ENTRANTE, y para la tolva completa, porque el operador la va a
  // vaciar antes de cargarla.
  const maquinaIds = (asigMaquinas ?? [])
    .map((am) => am.maquina_id)
    .filter(Boolean);

  const { data: sustPendientes } =
    maquinaIds.length > 0
      ? await supabase
          .from("sustituciones_tolva")
          .select("tolva_id, producto_entrante_id")
          .in("maquina_id", maquinaIds)
          .eq("estado", "pendiente")
      : { data: [] };

  const entrantePorTolva = new Map<string, string>();
  for (const s of sustPendientes ?? []) {
    entrantePorTolva.set(s.tolva_id, s.producto_entrante_id);
  }

  // Recolecta los producto_id involucrados para traer su gramaje_cartucho_default
  const productoIds = new Set<string>();
  for (const am of asigMaquinas ?? []) {
    const maquina = Array.isArray(am.maquina) ? am.maquina[0] : am.maquina;
    if (!maquina) continue;
    const tolvas = Array.isArray(maquina.tolvas) ? maquina.tolvas : [];
    for (const t of tolvas) {
      const productoId = entrantePorTolva.get(t.id) ?? t.producto_id;
      if (productoId) productoIds.add(productoId);
    }
    if (maquina.vaso_producto_id) productoIds.add(maquina.vaso_producto_id);
  }

  const { data: productos } =
    productoIds.size > 0
      ? await supabase
          .from("productos")
          .select("id, gramaje_cartucho_default, capacidad_g_por_tolva")
          .in("id", Array.from(productoIds))
      : { data: [] };

  const gramajePorProducto = new Map<string, number>();
  const capacidadPorProducto = new Map<string, number | null>();
  for (const p of productos ?? []) {
    gramajePorProducto.set(p.id, p.gramaje_cartucho_default ?? 400);
    capacidadPorProducto.set(p.id, p.capacidad_g_por_tolva);
  }

  // Calcula sugerido por (maquina, producto).
  // Lógica actual (sin datos de venta):
  //   - Polvos: llenar cada tolva al 100% de su capacidad. Cartuchos =
  //     ceil(gramos_a_surtir / gramaje_cartucho del producto).
  //   - Vasos: llenar al 100% de la capacidad de la máquina.
  // Pendiente Fase 9 (Nayax): velocidad de consumo × frecuencia visita.
  const sugeridoMap = new Map<string, Sugerido>();
  const key = (m: string, p: string) => `${m}|${p}`;

  for (const am of asigMaquinas ?? []) {
    const maquina = Array.isArray(am.maquina) ? am.maquina[0] : am.maquina;
    if (!maquina) continue;

    const tolvas = Array.isArray(maquina.tolvas) ? maquina.tolvas : [];
    for (const t of tolvas) {
      // Con sustitución pendiente el sugerido cambia de producto y de cálculo:
      // el operador vacía la tolva, así que el espacio es la capacidad entera.
      const entranteId = entrantePorTolva.get(t.id);
      const productoId = entranteId ?? t.producto_id;
      if (!productoId) continue;

      const gramajeCartucho = gramajePorProducto.get(productoId) ?? 400;

      // Con sustitución, la capacidad también cambia: el trigger
      // tolva_recalc_capacidad la deriva del producto, así que al ejecutarse la
      // tolva tomará la del entrante. Se replica aquí (override → producto →
      // 1200) para no surtir de menos cuando los dos sabores caben distinto.
      const capacidadG = entranteId
        ? (t.capacidad_max_g_override ??
           capacidadPorProducto.get(productoId) ??
           1200)
        : (t.capacidad_max_g ?? 1200);

      const espacioG = entranteId
        ? capacidadG
        : Math.max(0, capacidadG - (t.inventario_actual_g ?? 0));
      if (espacioG <= 0) continue;
      // floor: solo sugerimos los cartuchos que caben COMPLETOS en la tolva.
      // Si el último cartucho no cabe entero, no lo llevamos para evitar
      // que el operador regrese cartuchos parcialmente usados al almacén.
      const cartuchos = Math.floor(espacioG / gramajeCartucho);
      if (cartuchos <= 0) continue;

      const k = key(maquina.id, productoId);
      const prev = sugeridoMap.get(k) ?? {
        maquina_id: maquina.id,
        producto_id: productoId,
        cartuchos: 0,
        vasos: 0,
      };
      prev.cartuchos += cartuchos;
      sugeridoMap.set(k, prev);
    }

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

export async function actualizarSurtidoItemDirecto(input: {
  id: string;
  surtidoId: string;
  cartuchosEntregados: number;
  vasosEntregados: number;
}): Promise<ItemResult> {
  await requireRole(...ROLES);

  if (!input.id || !input.surtidoId) {
    return { ok: false, message: "Falta id." };
  }
  if (!Number.isInteger(input.cartuchosEntregados) || input.cartuchosEntregados < 0) {
    return { ok: false, message: "Cartuchos debe ser entero ≥ 0." };
  }
  if (!Number.isInteger(input.vasosEntregados) || input.vasosEntregados < 0) {
    return { ok: false, message: "Vasos debe ser entero ≥ 0." };
  }

  const supabase = createClient();
  const { data: surt } = await supabase
    .from("surtidos")
    .select("estado")
    .eq("id", input.surtidoId)
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
      cartuchos_entregados: input.cartuchosEntregados,
      vasos_entregados: input.vasosEntregados,
    })
    .eq("id", input.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/planeacion/surtidos/${input.surtidoId}`);
  return { ok: true, message: "Item actualizado." };
}

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
// Agregar manualmente un item al surtido (producto fuera del sugerido)
// ============================================================================

export async function agregarItemSurtido(
  _prev: ItemResult | null,
  formData: FormData,
): Promise<ItemResult> {
  await requireRole(...ROLES);

  const surtido_id = String(formData.get("surtido_id") ?? "");
  const maquina_id = String(formData.get("maquina_id") ?? "");
  const producto_id = String(formData.get("producto_id") ?? "");
  const cartuchos = Number(formData.get("cartuchos_entregados") ?? 0);
  const vasos = Number(formData.get("vasos_entregados") ?? 0);

  if (!surtido_id || !maquina_id || !producto_id) {
    return { ok: false, message: "Falta surtido, máquina o producto." };
  }
  if (!Number.isInteger(cartuchos) || cartuchos < 0) {
    return { ok: false, message: "Cartuchos debe ser entero ≥ 0." };
  }
  if (!Number.isInteger(vasos) || vasos < 0) {
    return { ok: false, message: "Vasos debe ser entero ≥ 0." };
  }
  if (cartuchos === 0 && vasos === 0) {
    return { ok: false, message: "Indica al menos 1 cartucho o vaso." };
  }

  const supabase = createClient();

  const { data: surt } = await supabase
    .from("surtidos")
    .select("estado, asignacion_id")
    .eq("id", surtido_id)
    .maybeSingle();
  if (!surt) return { ok: false, message: "Surtido no encontrado." };
  if (surt.estado === "completado") {
    return {
      ok: false,
      message: "El surtido ya está completado y no admite cambios.",
    };
  }

  const { data: am } = await supabase
    .from("asignacion_maquinas")
    .select("id")
    .eq("asignacion_id", surt.asignacion_id)
    .eq("maquina_id", maquina_id)
    .maybeSingle();
  if (!am) {
    return {
      ok: false,
      message: "La máquina no pertenece a esta asignación.",
    };
  }

  const { data: maquina } = await supabase
    .from("maquinas")
    .select("vaso_producto_id, tolvas:tolvas(producto_id)")
    .eq("id", maquina_id)
    .maybeSingle();
  if (!maquina) return { ok: false, message: "Máquina no encontrada." };

  const tolvaProductoIds = new Set(
    (Array.isArray(maquina.tolvas) ? maquina.tolvas : [])
      .map((t) => t.producto_id)
      .filter((p): p is string => Boolean(p)),
  );
  const esVaso = maquina.vaso_producto_id === producto_id;
  const esPolvoDeMaquina = tolvaProductoIds.has(producto_id);
  if (!esVaso && !esPolvoDeMaquina) {
    return {
      ok: false,
      message: "El producto no está asignado a ninguna tolva ni al vaso de esta máquina.",
    };
  }

  const { data: prod } = await supabase
    .from("productos")
    .select("tipo")
    .eq("id", producto_id)
    .maybeSingle();
  if (!prod) return { ok: false, message: "Producto no encontrado." };

  if (prod.tipo === "polvo" && vasos > 0) {
    return { ok: false, message: "Un producto polvo no lleva vasos." };
  }
  if (prod.tipo === "vaso" && cartuchos > 0) {
    return { ok: false, message: "Un producto vaso no lleva cartuchos." };
  }

  const { data: existente } = await supabase
    .from("surtido_items")
    .select("id")
    .eq("surtido_id", surtido_id)
    .eq("maquina_id", maquina_id)
    .eq("producto_id", producto_id)
    .maybeSingle();
  if (existente) {
    return {
      ok: false,
      message: "Ese producto ya está en el surtido para esta máquina. Edita la fila existente.",
    };
  }

  const { error } = await supabase.from("surtido_items").insert({
    surtido_id,
    maquina_id,
    producto_id,
    cartuchos_sugeridos: 0,
    cartuchos_entregados: cartuchos,
    vasos_sugeridos: 0,
    vasos_entregados: vasos,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/planeacion/surtidos/${surtido_id}`);
  return { ok: true, message: "Producto agregado al surtido." };
}

// ============================================================================
// Eliminar item del surtido (mientras esté editable)
// ============================================================================

export async function eliminarItemSurtido(formData: FormData): Promise<void> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  const surtido_id = String(formData.get("surtido_id") ?? "");
  if (!id || !surtido_id) {
    redirect("/planeacion/surtidos");
  }

  const supabase = createClient();

  const { data: surt } = await supabase
    .from("surtidos")
    .select("estado")
    .eq("id", surtido_id)
    .maybeSingle();
  if (!surt) redirect("/planeacion/surtidos");
  if (surt.estado === "completado") {
    redirect(
      `/planeacion/surtidos/${surtido_id}?error=${encodeURIComponent(
        "El surtido ya está completado y no admite cambios.",
      )}`,
    );
  }

  const { error } = await supabase
    .from("surtido_items")
    .delete()
    .eq("id", id)
    .eq("surtido_id", surtido_id);

  if (error) {
    redirect(
      `/planeacion/surtidos/${surtido_id}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/planeacion/surtidos/${surtido_id}`);
  redirect(`/planeacion/surtidos/${surtido_id}`);
}

// ============================================================================
// Completar surtido
//
// Todo el trabajo vive en el RPC `completar_surtido`: una sola transacción que
// valida stock (agregado por producto, no item por item), aplica PEPS,
// descuenta contadores, registra kardex y sella el surtido. Si algo falla,
// Postgres revierte todo y el surtido se queda pendiente — se puede reintentar.
//
// Antes esto se hacía con ~10 llamadas sueltas desde aquí, cada una con su
// propio commit: cuando el PEPS reventaba a media lista el surtido se quedaba
// marcado como completado con el inventario descontado a medias, y el reintento
// salía en silencio sin hacer nada (SUR-000387, 1-oct-2026).
// ============================================================================

export async function completarSurtido(formData: FormData): Promise<void> {
  await requireRole(...ROLES);

  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/planeacion/surtidos");

  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("completar_surtido", {
    p_surtido_id: id,
  });

  if (error) {
    redirect(
      `/planeacion/surtidos/${id}?error=${encodeURIComponent(error.message)}`,
    );
  }

  const { data: surt } = await supabase
    .from("surtidos")
    .select("asignacion_id")
    .eq("id", id)
    .maybeSingle();

  revalidatePath("/planeacion/surtidos");
  revalidatePath(`/planeacion/surtidos/${id}`);
  if (surt?.asignacion_id) {
    revalidatePath(`/planeacion/asignaciones/${surt.asignacion_id}`);
  }
  redirect(`/planeacion/surtidos/${id}`);
}
