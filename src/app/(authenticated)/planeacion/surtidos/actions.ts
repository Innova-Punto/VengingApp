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
           capacidad_max_g, inventario_actual_g
         )
       )`,
    )
    .eq("asignacion_id", asignacion_id);

  // Recolecta los producto_id involucrados para traer su gramaje_cartucho_default
  const productoIds = new Set<string>();
  for (const am of asigMaquinas ?? []) {
    const maquina = Array.isArray(am.maquina) ? am.maquina[0] : am.maquina;
    if (!maquina) continue;
    const tolvas = Array.isArray(maquina.tolvas) ? maquina.tolvas : [];
    for (const t of tolvas) {
      if (t.producto_id) productoIds.add(t.producto_id);
    }
    if (maquina.vaso_producto_id) productoIds.add(maquina.vaso_producto_id);
  }

  const { data: productos } =
    productoIds.size > 0
      ? await supabase
          .from("productos")
          .select("id, gramaje_cartucho_default")
          .in("id", Array.from(productoIds))
      : { data: [] };

  const gramajePorProducto = new Map<string, number>();
  for (const p of productos ?? []) {
    gramajePorProducto.set(p.id, p.gramaje_cartucho_default ?? 400);
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
      if (!t.producto_id) continue;
      const gramajeCartucho =
        gramajePorProducto.get(t.producto_id) ?? 400;
      const espacioG = Math.max(
        0,
        (t.capacidad_max_g ?? 2000) - (t.inventario_actual_g ?? 0),
      );
      if (espacioG <= 0) continue;
      // floor: solo sugerimos los cartuchos que caben COMPLETOS en la tolva.
      // Si el último cartucho no cabe entero, no lo llevamos para evitar
      // que el operador regrese cartuchos parcialmente usados al almacén.
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
       producto:productos(sku, nombre, tipo, gramaje_cartucho_default)`,
    )
    .eq("surtido_id", id);

  // Helper para llamar RPCs no expuestas en el typegen.
  // IMPORTANTE: castamos el cliente entero (no solo .rpc) para que la
  // llamada se haga como método y preserve el binding de `this` interno.
  type RpcResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  const callRpc = <T>(fn: string, args: Record<string, unknown>): RpcResult<T> =>
    supabaseAny.rpc(fn, args);

  // -- Paso 1: validar stock disponible para TODOS los items antes de tocar nada
  const erroresStock: string[] = [];
  for (const it of items ?? []) {
    const prod = Array.isArray(it.producto) ? it.producto[0] : it.producto;
    if (!prod) continue;

    if (prod.tipo === "polvo" && (it.cartuchos_entregados ?? 0) > 0) {
      // Cuenta total disponible de cartuchos del producto
      const { data: encs } = await supabase
        .from("encartuchados")
        .select("cantidad_disponible")
        .eq("producto_id", it.producto_id);
      const disp = (encs ?? []).reduce(
        (s, e) => s + (e.cantidad_disponible ?? 0),
        0,
      );
      if (disp < it.cartuchos_entregados) {
        erroresStock.push(
          `${prod.sku ?? prod.nombre}: pides ${it.cartuchos_entregados} cartucho(s), solo hay ${disp}`,
        );
      }
    }
    if (prod.tipo === "vaso" && (it.vasos_entregados ?? 0) > 0) {
      const { data: lotes } = await supabase
        .from("lotes")
        .select("unidades_disponibles")
        .eq("producto_id", it.producto_id)
        .eq("activo", true);
      const disp = (lotes ?? []).reduce(
        (s, l) => s + (l.unidades_disponibles ?? 0),
        0,
      );
      if (disp < it.vasos_entregados) {
        erroresStock.push(
          `${prod.sku ?? prod.nombre}: pides ${it.vasos_entregados} vaso(s), solo hay ${disp}`,
        );
      }
    }
  }

  if (erroresStock.length > 0) {
    const msg = `Stock insuficiente — ${erroresStock.join(" | ")}`;
    redirect(
      `/planeacion/surtidos/${id}?error=${encodeURIComponent(msg)}`,
    );
  }

  // -- Paso 2: aplicar PEPS y descontar inventario por cada item
  for (const it of items ?? []) {
    const prod = Array.isArray(it.producto) ? it.producto[0] : it.producto;
    if (!prod) continue;

    if (prod.tipo === "polvo" && (it.cartuchos_entregados ?? 0) > 0) {
      const { data: picked, error: pepsErr } = await callRpc<PepsCartucho[]>(
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
      const picks = picked ?? [];

      const primario = picks[0];
      if (primario) {
        await supabase
          .from("surtido_items")
          .update({ encartuchado_id: primario.encartuchado_id })
          .eq("id", it.id);
      }

      for (const p of picks) {
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
      const { data: picked, error: pepsErr } = await callRpc<PepsVaso[]>(
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
      const picks = picked ?? [];

      const primario = picks[0];
      if (primario) {
        await supabase
          .from("surtido_items")
          .update({ lote_vaso_id: primario.lote_id })
          .eq("id", it.id);
      }

      for (const p of picks) {
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

  // -- Paso 3: marcar completado
  await supabase
    .from("surtidos")
    .update({
      estado: "completado",
      surtido_por: current.id,
      fecha_completado: new Date().toISOString(),
    })
    .eq("id", id);

  await supabase
    .from("asignaciones_diarias")
    .update({ estado: "surtida" })
    .eq("id", surt.asignacion_id);

  revalidatePath("/planeacion/surtidos");
  revalidatePath(`/planeacion/surtidos/${id}`);
  revalidatePath(`/planeacion/asignaciones/${surt.asignacion_id}`);
  redirect(`/planeacion/surtidos/${id}`);
}
