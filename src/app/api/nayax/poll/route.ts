import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Endpoint que consume mensajes de la cola SQS donde Nayax publica
 * cada transacción. Se invoca por Vercel Cron cada minuto.
 *
 * Por cada mensaje:
 *  - Parsea el JSON de Nayax (formato del PDF: TransactionId, MachineId,
 *    Data.Products[]...).
 *  - Si Void = true, omite (no procesamos cancelaciones todavía).
 *  - Por cada producto en Products[]: llama procesar_venta_nayax usando
 *    {TransactionId}-{PACode} como identificador único.
 *  - Si todos los items se procesaron (o eran duplicados), borra el
 *    mensaje de la cola. Si alguno falló, NO borra (SQS retry).
 */

type NayaxProduct = {
  "Product PA Code"?: string | null;
  "Product Name"?: string | null;
  "Product Bruto"?: number | string | null;
  "Product Catalog Number"?: string | null;
};

type NayaxData = {
  Currency?: string;
  "Payed Value"?: number | string;
  "Machine Price"?: number | string;
  "Payment Method Description"?: string;
  "Authorization RRN"?: string;
  Products?: NayaxProduct[];
};

type NayaxMessage = {
  TransactionId?: number | string;
  MachineId?: number | string;
  MachineTime?: string;
  Void?: boolean;
  Data?: NayaxData;
};

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno ${name}`);
  return v;
}

function parseNumber(v: number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: Request) {
  // Auth Vercel Cron: cron job manda Authorization: Bearer <CRON_SECRET>
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let queueUrl: string;
  let region: string;
  let accessKeyId: string;
  let secretAccessKey: string;
  try {
    queueUrl = getEnv("AWS_SQS_URL");
    region = process.env.AWS_SQS_REGION || "us-east-1";
    accessKeyId = getEnv("AWS_SQS_ACCESS_KEY_ID");
    secretAccessKey = getEnv("AWS_SQS_SECRET_ACCESS_KEY");
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const sqs = new SQSClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  // 1) Abre sync log
  const { data: syncLogId, error: logErr } = await supabaseAny.rpc(
    "iniciar_sync_log_nayax",
    { p_cursor_desde: null, p_cursor_hasta: null },
  );
  if (logErr) {
    return NextResponse.json(
      { ok: false, error: `sync_log: ${logErr.message}` },
      { status: 500 },
    );
  }

  let recibidos = 0;
  let procesados = 0;
  let duplicados = 0;
  let voided = 0;
  let errores = 0;
  const erroresDetalle: { transaction_id: string; error: string }[] = [];

  // 2) Polling: máximo 10 mensajes por invocación; usar long polling 5s
  try {
    const receive = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5,
        VisibilityTimeout: 30,
      }),
    );

    const messages = receive.Messages ?? [];
    recibidos = messages.length;

    for (const msg of messages) {
      const body = msg.Body ?? "";
      const receiptHandle = msg.ReceiptHandle;
      if (!receiptHandle) continue;

      let payload: NayaxMessage;
      try {
        payload = JSON.parse(body) as NayaxMessage;
      } catch (e) {
        errores += 1;
        erroresDetalle.push({
          transaction_id: msg.MessageId ?? "?",
          error: `JSON inválido: ${e instanceof Error ? e.message : String(e)}`,
        });
        // No borramos: queda en cola para inspección manual
        continue;
      }

      // Skip Voided: no procesamos cancelaciones por ahora
      if (payload.Void === true) {
        voided += 1;
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
          }),
        );
        continue;
      }

      const transactionId = String(payload.TransactionId ?? "");
      const machineId = String(payload.MachineId ?? "");
      const machineTime = payload.MachineTime ?? new Date().toISOString();
      const productos = payload.Data?.Products ?? [];
      const metodoPago = payload.Data?.["Payment Method Description"] ?? null;
      const ticketId = payload.Data?.["Authorization RRN"] ?? null;

      if (!transactionId || !machineId || productos.length === 0) {
        errores += 1;
        erroresDetalle.push({
          transaction_id: transactionId || (msg.MessageId ?? "?"),
          error: "Falta TransactionId, MachineId o Products[]",
        });
        // Borrar igual: el mensaje no se puede procesar
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
          }),
        );
        continue;
      }

      // Por cada producto en Products[] (multivend)
      let allOkOrDup = true;
      for (const prod of productos) {
        const paCode = prod["Product PA Code"];
        if (!paCode) {
          errores += 1;
          erroresDetalle.push({
            transaction_id: transactionId,
            error: "Producto sin PA Code",
          });
          allOkOrDup = false;
          continue;
        }
        const precioBruto = parseNumber(prod["Product Bruto"]);

        // Identificador único: {TransactionId}-{PA Code} (soporta multivend)
        const txKey = `${transactionId}-${paCode}`;

        try {
          const { error: rpcErr } = await supabaseAny.rpc(
            "procesar_venta_nayax",
            {
              p_nayax_transaction_id: txKey,
              p_nayax_machine_id: machineId,
              p_nayax_item_code: paCode,
              p_fecha_transaccion: machineTime,
              p_precio_bruto: precioBruto,
              p_metodo_pago: metodoPago,
              p_ticket_id: ticketId,
              p_sync_log_id: syncLogId,
            },
          );
          if (rpcErr) {
            // Si es duplicado, no es error real
            if (
              rpcErr.message?.includes("duplicate") ||
              rpcErr.message?.includes("ventas_maquina_nayax_transaction_id_key")
            ) {
              duplicados += 1;
            } else {
              errores += 1;
              erroresDetalle.push({
                transaction_id: txKey,
                error: rpcErr.message,
              });
              allOkOrDup = false;
            }
          } else {
            procesados += 1;
          }
        } catch (e) {
          errores += 1;
          erroresDetalle.push({
            transaction_id: txKey,
            error: e instanceof Error ? e.message : String(e),
          });
          allOkOrDup = false;
        }
      }

      // Solo borrar el mensaje si todos sus items se procesaron OK (o eran dup)
      if (allOkOrDup) {
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
          }),
        );
      }
    }
  } catch (e) {
    errores += 1;
    erroresDetalle.push({
      transaction_id: "sqs",
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 3) Cierra sync log
  await supabaseAny.rpc("cerrar_sync_log_nayax", {
    p_id: syncLogId,
    p_jaladas: recibidos,
    p_nuevas: procesados,
    p_duplicadas: duplicados,
    p_errores: errores,
    p_mensaje_error:
      erroresDetalle.length > 0
        ? JSON.stringify(erroresDetalle.slice(0, 20))
        : null,
  });

  return NextResponse.json({
    ok: true,
    sync_log_id: syncLogId,
    recibidos,
    procesados,
    duplicados,
    voided,
    errores,
    errores_detalle: erroresDetalle,
  });
}
