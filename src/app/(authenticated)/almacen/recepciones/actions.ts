"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "direccion", "almacen"] as const;

export type RecepcionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

/**
 * Crea una recepción a partir del form que el operador llenó con las
 * cantidades recibidas por cada oc_item.
 *
 * El formData contiene:
 *  - oc_id
 *  - factura_proveedor (optional)
 *  - notas (optional)
 *  - recibido_<oc_item_id>: cantidad recibida (entero)
 *  - lote_<oc_item_id>: código de lote opcional (sino lo auto-generamos)
 *  - cad_<oc_item_id>: fecha de caducidad opcional (date YYYY-MM-DD)
 */
export async function crearRecepcion(
  _prev: RecepcionResult | null,
  formData: FormData,
): Promise<RecepcionResult> {
  const current = await requireRole(...ROLES);

  const oc_id = String(formData.get("oc_id") ?? "");
  const factura =
    String(formData.get("factura_proveedor") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!oc_id) return { ok: false, message: "Falta la OC." };

  const supabase = createClient();

  // Verificar OC y traer items + presentaciones para validar cantidades
  const { data: oc, error: ocErr } = await supabase
    .from("ordenes_compra")
    .select(
      `id, folio, estado, proveedor_id,
       items:oc_items(
         id, cantidad, recibido, costo_unitario, presentacion_id,
         presentacion:presentaciones_proveedor(
           id, peso_neto_gramos, unidades_por_presentacion,
           producto:productos(id, tipo, sku, requiere_encartuchado)
         )
       )`,
    )
    .eq("id", oc_id)
    .maybeSingle();

  if (ocErr) return { ok: false, message: ocErr.message };
  if (!oc) return { ok: false, message: "OC no encontrada." };
  if (oc.estado !== "enviada" && oc.estado !== "parcial") {
    return {
      ok: false,
      message: `La OC está en estado ${oc.estado} y no admite más recepciones.`,
    };
  }

  // Recolectar líneas a recibir
  type Linea = {
    oc_item_id: string;
    presentaciones_recibidas: number;
    codigo_lote: string;
    fecha_caducidad: string | null;
    costo_unitario: number;
    presentacion_id: string;
    peso_neto_gramos: number;
    unidades_por_presentacion: number;
    producto_id: string;
    producto_tipo: "polvo" | "vaso";
    producto_sku: string;
    producto_requiere_encartuchado: boolean;
    pendiente: number;
  };

  const lineas: Linea[] = [];
  for (const it of oc.items ?? []) {
    const recibidoRaw = formData.get(`recibido_${it.id}`);
    const cantRecibida = Number(recibidoRaw);
    if (!Number.isFinite(cantRecibida) || cantRecibida <= 0) continue;

    if (!Number.isInteger(cantRecibida)) {
      return {
        ok: false,
        message: `Item ${it.id}: cantidad debe ser entero.`,
      };
    }

    const pendiente = it.cantidad - it.recibido;
    if (cantRecibida > pendiente) {
      return {
        ok: false,
        message: `No puedes recibir más de lo pendiente (${pendiente}) en uno de los items.`,
      };
    }

    const pres = Array.isArray(it.presentacion)
      ? it.presentacion[0]
      : it.presentacion;
    if (!pres) {
      return { ok: false, message: "Item sin presentación asociada." };
    }
    const prod = Array.isArray(pres.producto)
      ? pres.producto[0]
      : pres.producto;
    if (!prod) {
      return { ok: false, message: "Presentación sin producto asociado." };
    }

    const codigoLoteUser = String(formData.get(`lote_${it.id}`) ?? "").trim();
    const fechaCadRaw =
      String(formData.get(`cad_${it.id}`) ?? "").trim() || null;

    lineas.push({
      oc_item_id: it.id,
      presentaciones_recibidas: cantRecibida,
      codigo_lote: codigoLoteUser,
      fecha_caducidad: fechaCadRaw,
      costo_unitario: Number(it.costo_unitario),
      presentacion_id: pres.id,
      peso_neto_gramos: pres.peso_neto_gramos,
      unidades_por_presentacion: pres.unidades_por_presentacion,
      producto_id: prod.id,
      producto_tipo: prod.tipo,
      producto_sku: prod.sku,
      producto_requiere_encartuchado:
        prod.requiere_encartuchado !== false,
      pendiente,
    });
  }

  if (lineas.length === 0) {
    return {
      ok: false,
      message: "Debes indicar la cantidad recibida en al menos un item.",
    };
  }

  // 1) crear cabecera de recepción (folio auto)
  const { data: recep, error: recErr } = await supabase
    .from("recepciones")
    .insert({
      folio: "",
      oc_id,
      recibido_por: current.id,
      factura_proveedor: factura,
      notas,
      fecha: new Date().toISOString().slice(0, 10),
    })
    .select("id, folio")
    .single();

  if (recErr || !recep) {
    return { ok: false, message: recErr?.message ?? "No se pudo crear la recepción." };
  }

  // 2) por cada línea, crear lote + recepcion_item
  let seq = 0;
  for (const l of lineas) {
    seq++;
    const codigoLote =
      l.codigo_lote ||
      `LOT-${recep.folio}-${String(seq).padStart(2, "0")}`;

    const totalGramos =
      l.producto_tipo === "polvo"
        ? l.presentaciones_recibidas * l.peso_neto_gramos
        : 0;
    const totalUnidades =
      l.producto_tipo === "vaso"
        ? l.presentaciones_recibidas * l.unidades_por_presentacion
        : null;

    // costo_por_gramo:
    //  - polvo: costo_unitario_pres / peso_neto_gramos
    //  - vaso:  costo_unitario_pres / unidades_por_presentacion  (proxy)
    const costoPorGramo =
      l.producto_tipo === "polvo"
        ? l.costo_unitario / l.peso_neto_gramos
        : l.costo_unitario / Math.max(1, l.unidades_por_presentacion);

    const { data: lote, error: loteErr } = await supabase
      .from("lotes")
      .insert({
        codigo_lote: codigoLote,
        producto_id: l.producto_id,
        proveedor_id: oc.proveedor_id,
        presentacion_id: l.presentacion_id,
        recepcion_id: recep.id,
        fecha_recepcion: new Date().toISOString().slice(0, 10),
        fecha_caducidad: l.fecha_caducidad,
        gramos_iniciales: totalGramos,
        gramos_disponibles_granel:
          l.producto_tipo === "polvo" ? totalGramos : 0,
        unidades_iniciales: totalUnidades,
        unidades_disponibles: totalUnidades,
        costo_por_gramo: costoPorGramo,
      })
      .select("id")
      .single();

    if (loteErr || !lote) {
      return {
        ok: false,
        message: `Lote ${codigoLote}: ${loteErr?.message ?? "error"}`,
      };
    }

    const { error: itemErr } = await supabase.from("recepcion_items").insert({
      recepcion_id: recep.id,
      oc_item_id: l.oc_item_id,
      lote_id: lote.id,
      presentaciones_recibidas: l.presentaciones_recibidas,
      peso_total_gramos: totalGramos,
      unidades_totales: totalUnidades,
    });

    if (itemErr) {
      return { ok: false, message: itemErr.message };
    }

    // Auto-encartuchado para productos pre-empacados (ej. café 1kg, choco 908g).
    // Cada presentación recibida = 1 cartucho con gramos = peso de la bolsa.
    // No hay paso de encartuchado manual; el lote queda con granel = 0 (todo
    // ya empaquetado desde origen) y los cartuchos quedan disponibles.
    if (
      l.producto_tipo === "polvo" &&
      l.producto_requiere_encartuchado === false
    ) {
      const gramosPorCartucho = Math.round(
        l.peso_neto_gramos / Math.max(1, l.unidades_por_presentacion),
      );
      const cartuchosProducidos =
        l.presentaciones_recibidas * l.unidades_por_presentacion;

      const { data: enc, error: encErr } = await supabase
        .from("encartuchados")
        .insert({
          folio: "",
          producto_id: l.producto_id,
          cartuchos_producidos: cartuchosProducidos,
          gramos_por_cartucho: gramosPorCartucho,
          gramos_totales_consumidos: totalGramos,
          gramos_merma: 0,
          costo_promedio_g: costoPorGramo,
          cantidad_disponible: cartuchosProducidos,
          operario_id: current.id,
          notas: `Auto-creado al recibir ${l.producto_sku} (producto pre-empacado).`,
        })
        .select("id")
        .single();

      if (encErr || !enc) {
        return {
          ok: false,
          message: `Encartuchado auto ${l.producto_sku}: ${encErr?.message ?? "error"}`,
        };
      }

      // Insertar encartuchado_lotes consumiendo todo el granel del lote.
      // El trigger trg_encartuchado_lote_kardex descontará el granel a 0
      // y creará el movimiento de salida.
      const valorAportado =
        Math.round(totalGramos * costoPorGramo * 100) / 100;
      const { error: elErr } = await supabase
        .from("encartuchado_lotes")
        .insert({
          encartuchado_id: enc.id,
          lote_id: lote.id,
          gramos_consumidos: totalGramos,
          costo_por_gramo_lote: costoPorGramo,
          valor_aportado: valorAportado,
        });

      if (elErr) {
        return {
          ok: false,
          message: `Vinculando lote a encartuchado auto: ${elErr.message}`,
        };
      }

      // Kardex: entrada de cartuchos al almacén
      const valorCartuchos =
        Math.round(cartuchosProducidos * gramosPorCartucho * costoPorGramo * 100) /
        100;
      await supabase.from("movimientos_inventario").insert({
        tipo: "encartuchado_entrada_cartucho",
        producto_id: l.producto_id,
        encartuchado_id: enc.id,
        presentacion: "cartucho",
        cantidad_cartuchos: cartuchosProducidos,
        gramos: cartuchosProducidos * gramosPorCartucho,
        costo_por_gramo_snapshot: costoPorGramo,
        valor_movimiento: valorCartuchos,
        referencia_tabla: "encartuchados",
        referencia_id: enc.id,
      });
    }
  }

  revalidatePath("/almacen/recepciones");
  revalidatePath("/almacen/lotes");
  revalidatePath(`/compras/ordenes/${oc_id}`);
  redirect(`/almacen/recepciones/${recep.id}`);
}
