"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function iniciarConteo(formData: FormData): Promise<void> {
  await requireRole("admin", "direccion", "almacen");
  const cierreId = String(formData.get("cierre_id") ?? "");
  if (!cierreId) {
    redirect("/almacen/conteos?error=" + encodeURIComponent("Falta cierre."));
  }

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  const { data, error } = await supabaseAny.rpc("iniciar_conteo_almacen", {
    p_cierre_id: cierreId,
  });
  if (error) {
    redirect("/almacen/conteos?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/almacen/conteos");
  redirect(`/almacen/conteos/${data}`);
}

// Reparte un físico total entre items (lotes/encartuchados) ordenados de más
// viejo a más nuevo (PEPS): si falta, se descuenta de los más viejos primero;
// si sobra, se suma al más nuevo. Devuelve el físico asignado por item.
function repartirPeps(
  items: { id: string; sistema: number }[],
  fisicoTotal: number,
): { id: string; fisico: number }[] {
  const result = items.map((i) => ({ id: i.id, fisico: 0 }));
  if (items.length === 0) return result;
  const sistemaTotal = items.reduce((s, i) => s + i.sistema, 0);
  if (fisicoTotal >= sistemaTotal) {
    // Sobrante: cada item conserva su sistema; el excedente al más nuevo.
    items.forEach((i, idx) => {
      result[idx].fisico = i.sistema;
    });
    result[result.length - 1].fisico += fisicoTotal - sistemaTotal;
  } else {
    // Faltante: se llena desde el más nuevo hacia atrás; los más viejos
    // absorben el faltante (quedan reducidos / en cero).
    let restante = fisicoTotal;
    for (let idx = items.length - 1; idx >= 0; idx--) {
      const dar = Math.min(items[idx].sistema, restante);
      result[idx].fisico = dar;
      restante -= dar;
    }
  }
  return result;
}

export async function aplicarConteo(input: {
  conteoId: string;
  granel: { producto_id: string; gramos_fisicos: number }[];
  cartuchos: { producto_id: string; cantidad_fisica: number }[];
}): Promise<ActionResult> {
  await requireRole("admin", "direccion", "almacen");

  if (!input.conteoId) return { ok: false, message: "Falta conteo." };

  const supabase = createClient();

  // 1) Cargar items del conteo con datos de antigüedad (para PEPS)
  const { data: granelItems } = await supabase
    .from("conteo_granel_items")
    .select(
      `id, gramos_sistema,
       lote:lotes(producto_id, fecha_recepcion, created_at)`,
    )
    .eq("conteo_id", input.conteoId);

  const { data: cartuchosItems } = await supabase
    .from("conteo_cartuchos_items")
    .select(
      `id, producto_id, cantidad_sistema,
       encartuchado:encartuchados!conteo_cartuchos_items_encartuchado_id_fkey(fecha, created_at)`,
    )
    .eq("conteo_id", input.conteoId);

  // 2) Agrupar por producto y ordenar por antigüedad (viejo → nuevo)
  type Row = { id: string; sistema: number; orden: string; producto: string };
  const granelRows: Row[] = (granelItems ?? []).map((g) => {
    const lote = Array.isArray(g.lote) ? g.lote[0] : g.lote;
    return {
      id: g.id,
      sistema: g.gramos_sistema ?? 0,
      producto: lote?.producto_id ?? "",
      orden: `${lote?.fecha_recepcion ?? ""}|${lote?.created_at ?? ""}`,
    };
  });
  const cartuchosRows: Row[] = (cartuchosItems ?? []).map((c) => {
    const enc = Array.isArray(c.encartuchado) ? c.encartuchado[0] : c.encartuchado;
    return {
      id: c.id,
      sistema: c.cantidad_sistema ?? 0,
      producto: c.producto_id ?? "",
      orden: `${enc?.fecha ?? ""}|${enc?.created_at ?? ""}`,
    };
  });

  const agrupar = (rows: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      if (!r.producto) continue;
      const arr = m.get(r.producto) ?? [];
      arr.push(r);
      m.set(r.producto, arr);
    }
    Array.from(m.values()).forEach((arr) =>
      arr.sort((a, b) => a.orden.localeCompare(b.orden)),
    );
    return m;
  };
  const granelPorProd = agrupar(granelRows);
  const cartuchosPorProd = agrupar(cartuchosRows);

  // 3) Repartir el físico de cada producto entre sus lotes/encartuchados
  const pGranel: { id: string; gramos_fisicos: number }[] = [];
  for (const { producto_id, gramos_fisicos } of input.granel) {
    const items = granelPorProd.get(producto_id);
    if (!items) continue;
    for (const r of repartirPeps(items, gramos_fisicos)) {
      pGranel.push({ id: r.id, gramos_fisicos: r.fisico });
    }
  }
  const pCartuchos: { id: string; cantidad_fisica: number }[] = [];
  for (const { producto_id, cantidad_fisica } of input.cartuchos) {
    const items = cartuchosPorProd.get(producto_id);
    if (!items) continue;
    for (const r of repartirPeps(items, cantidad_fisica)) {
      pCartuchos.push({ id: r.id, cantidad_fisica: r.fisico });
    }
  }

  // 4) Aplicar con el motor de ajuste por lote existente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;
  const { error } = await supabaseAny.rpc("aplicar_conteo_almacen", {
    p_conteo_id: input.conteoId,
    p_granel: pGranel,
    p_cartuchos: pCartuchos,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/almacen/conteos");
  revalidatePath(`/almacen/conteos/${input.conteoId}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/cierres", "layout");
  return { ok: true, message: "Conteo aplicado. Diferencias registradas." };
}
