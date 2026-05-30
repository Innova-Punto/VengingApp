import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingTx = {
  transaction_id: string;
  machine_id: string;
  item_code: string;
  fecha?: string;
  precio_bruto: number;
  metodo_pago?: string | null;
  ticket_id?: string | null;
};

type Payload = {
  cursor_desde?: string;
  cursor_hasta?: string;
  transactions: IncomingTx[];
};

export async function POST(request: Request) {
  const secretEnv = process.env.NAYAX_WEBHOOK_SECRET;
  if (!secretEnv) {
    return NextResponse.json(
      { ok: false, error: "NAYAX_WEBHOOK_SECRET no configurado" },
      { status: 500 },
    );
  }

  const provided =
    request.headers.get("x-nayax-secret") ??
    new URL(request.url).searchParams.get("secret");
  if (provided !== secretEnv) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body inválido" },
      { status: 400 },
    );
  }

  if (!payload?.transactions || !Array.isArray(payload.transactions)) {
    return NextResponse.json(
      { ok: false, error: "transactions[] requerido" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  // Abre sync log
  const { data: syncLogId, error: logErr } = await supabaseAny.rpc(
    "iniciar_sync_log_nayax",
    {
      p_cursor_desde: payload.cursor_desde ?? null,
      p_cursor_hasta: payload.cursor_hasta ?? null,
    },
  );
  if (logErr) {
    return NextResponse.json(
      { ok: false, error: `sync_log: ${logErr.message}` },
      { status: 500 },
    );
  }

  let nuevas = 0;
  let duplicadas = 0;
  let errores = 0;
  const erroresDetalle: { transaction_id: string; error: string }[] = [];

  for (const tx of payload.transactions) {
    try {
      if (!tx.transaction_id || !tx.machine_id || !tx.item_code) {
        throw new Error("Faltan campos obligatorios");
      }

      // Chequea duplicado antes (para distinguir nueva vs duplicada)
      const { data: existente } = await supabase
        .from("ventas_maquina")
        .select("id")
        .eq("nayax_transaction_id", tx.transaction_id)
        .maybeSingle();
      if (existente) {
        duplicadas += 1;
        continue;
      }

      const { error: rpcErr } = await supabaseAny.rpc("procesar_venta_nayax", {
        p_nayax_transaction_id: tx.transaction_id,
        p_nayax_machine_id: tx.machine_id,
        p_nayax_item_code: tx.item_code,
        p_fecha_transaccion: tx.fecha ?? new Date().toISOString(),
        p_precio_bruto: tx.precio_bruto,
        p_metodo_pago: tx.metodo_pago ?? null,
        p_ticket_id: tx.ticket_id ?? null,
        p_sync_log_id: syncLogId,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      nuevas += 1;
    } catch (e) {
      errores += 1;
      erroresDetalle.push({
        transaction_id: tx.transaction_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await supabaseAny.rpc("cerrar_sync_log_nayax", {
    p_id: syncLogId,
    p_jaladas: payload.transactions.length,
    p_nuevas: nuevas,
    p_duplicadas: duplicadas,
    p_errores: errores,
    p_mensaje_error:
      erroresDetalle.length > 0
        ? JSON.stringify(erroresDetalle.slice(0, 10))
        : null,
  });

  return NextResponse.json({
    ok: true,
    sync_log_id: syncLogId,
    procesadas: payload.transactions.length,
    nuevas,
    duplicadas,
    errores,
    errores_detalle: erroresDetalle,
  });
}
