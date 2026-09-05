import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { fmtCDMX } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const metadata = { title: "Quejas · Innovaypunto" };

const TIPO_LABEL: Record<string, string> = {
  cobro_sin_producto: "Cobró y no salió producto",
  cobro_duplicado: "Cobro duplicado",
  maquina_da_agua: "Máquina da agua",
  bebida_incompleta: "Bebida incompleta",
  vaso_vacio: "Vaso vacío",
  vaso_atorado: "Vaso atorado",
  vaso_atrapado_puerta: "Vaso atrapado en la puerta",
  producto_mal_estado: "Producto en mal estado",
  mal_olor: "Mal olor",
  terminal_no_pasa: "Terminal no pasa",
  touchscreen_no_sirve: "Touchscreen no sirve",
  maquina_en_error: "Máquina en error",
  otro: "Otro",
};

const ESTADO_LABEL: Record<string, string> = {
  abierta: "Abierta",
  en_validacion: "Con el operador",
  espera_cliente: "Esperando al cliente",
  procede: "Procede · por pagar",
  no_procede: "No procede",
  pagada: "Pagada",
  cerrada_resuelta: "Cerrada",
  cerrada_sin_respuesta: "Cerrada sin respuesta",
};

const ESTADO_BADGE: Record<string, string> = {
  abierta: "bg-blue-100 text-blue-700",
  en_validacion: "bg-amber-100 text-amber-700",
  espera_cliente: "bg-purple-100 text-purple-700",
  procede: "bg-orange-100 text-orange-700",
  no_procede: "bg-zinc-200 text-zinc-600",
  pagada: "bg-green-100 text-green-700",
  cerrada_resuelta: "bg-zinc-200 text-zinc-600",
  cerrada_sin_respuesta: "bg-zinc-200 text-zinc-600",
};

const ABIERTAS: Database["public"]["Enums"]["queja_estado"][] = [
  "abierta",
  "en_validacion",
  "espera_cliente",
  "procede",
];

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

type SearchParams = { antiguedad?: string; estado?: string };

export default async function QuejasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin", "direccion", "planeador");
  const supabase = createClient();

  const { data: quejasRaw } = await supabase
    .from("quejas")
    .select(
      `id, folio, fecha_reporte, telefono_ultimos4, tipo, estado,
       monto_reclamado, monto_autorizado, procede,
       maquina:maquinas(serie, alias),
       operador:profiles!quejas_operador_id_fkey(full_name)`,
    )
    .in("estado", ABIERTAS)
    .order("fecha_reporte", { ascending: true });

  const quejas = quejasRaw ?? [];

  // Último toque por queja: es el dato que dice a quién hay que hablarle hoy.
  const ids = quejas.map((q) => q.id);
  const { data: contactos } = ids.length
    ? await supabase
        .from("queja_contactos")
        .select("queja_id, fecha")
        .in("queja_id", ids)
        .order("fecha", { ascending: false })
    : { data: [] };
  const ultimoToque = new Map<string, string>();
  for (const c of contactos ?? []) {
    if (!ultimoToque.has(c.queja_id)) ultimoToque.set(c.queja_id, c.fecha);
  }

  const conEdad = quejas.map((q) => ({
    ...q,
    dias: diasDesde(q.fecha_reporte),
    toque: ultimoToque.get(q.id) ?? null,
  }));

  const cubos = {
    hoy: conEdad.filter((q) => q.dias === 0),
    d1: conEdad.filter((q) => q.dias === 1),
    d2: conEdad.filter((q) => q.dias === 2),
    d3: conEdad.filter((q) => q.dias >= 3),
  };

  const filtro = searchParams.antiguedad;
  const lista =
    filtro === "hoy"
      ? cubos.hoy
      : filtro === "1"
        ? cubos.d1
        : filtro === "2"
          ? cubos.d2
          : filtro === "3"
            ? cubos.d3
            : conEdad;

  const tarjetas = [
    { k: "hoy", label: "Hoy", n: cubos.hoy.length, tono: "zinc" },
    { k: "1", label: "1 día", n: cubos.d1.length, tono: "amber" },
    { k: "2", label: "2 días", n: cubos.d2.length, tono: "orange" },
    { k: "3", label: "3+ días", n: cubos.d3.length, tono: "red" },
  ] as const;

  const tonos: Record<string, string> = {
    zinc: "border-zinc-200 bg-white text-zinc-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    red: "border-red-300 bg-red-50 text-red-900",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quejas</h1>
          <p className="text-sm text-zinc-600">
            {conEdad.length} abiertas. Una queja se marca en rojo a los 3 días.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/quejas/reincidencia"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Reincidencia
          </Link>
          <Link
            href="/admin/quejas/nueva"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Registrar queja
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tarjetas.map((t) => (
          <Link
            key={t.k}
            href={filtro === t.k ? "/admin/quejas" : `/admin/quejas?antiguedad=${t.k}`}
            className={`rounded-lg border p-4 transition hover:shadow-sm ${tonos[t.tono]} ${
              filtro === t.k ? "ring-2 ring-zinc-900 ring-offset-1" : ""
            }`}
          >
            <div className="text-xs font-medium uppercase tracking-wide opacity-70">
              {t.label}
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{t.n}</div>
          </Link>
        ))}
      </section>

      {filtro && (
        <p className="text-sm text-zinc-600">
          Mostrando {lista.length}{" "}
          {lista.length === 1 ? "queja" : "quejas"} ·{" "}
          <Link href="/admin/quejas" className="underline">
            ver todas
          </Link>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Folio</th>
              <th className="px-4 py-2 font-medium">Reportada</th>
              <th className="px-4 py-2 font-medium">WhatsApp</th>
              <th className="px-4 py-2 font-medium">Máquina</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Monto</th>
              <th className="px-4 py-2 font-medium">Último toque</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {lista.map((q) => {
              const maq = Array.isArray(q.maquina) ? q.maquina[0] : q.maquina;
              const vieja = q.dias >= 3;
              return (
                <tr key={q.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/admin/quejas/${q.id}`} className="hover:underline">
                      {q.folio}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <span className={vieja ? "font-semibold text-red-700" : "text-zinc-600"}>
                      {q.dias === 0 ? "hoy" : `hace ${q.dias} d`}
                    </span>
                    <div className="text-zinc-400">
                      {fmtCDMX(q.fecha_reporte, { day: "2-digit", month: "short" })}
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-700">
                    ···{q.telefono_ultimos4}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <span className="font-mono">{maq?.serie ?? "—"}</span>
                    <div className="text-zinc-500">{maq?.alias ?? ""}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-700">
                    {TIPO_LABEL[q.tipo] ?? q.tipo}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        ESTADO_BADGE[q.estado] ?? "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {ESTADO_LABEL[q.estado] ?? q.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">
                    {q.monto_autorizado != null
                      ? `$${Number(q.monto_autorizado).toFixed(2)}`
                      : q.monto_reclamado != null
                        ? `$${Number(q.monto_reclamado).toFixed(2)}`
                        : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {q.toque ? (
                      <span className="text-zinc-600">
                        hace {diasDesde(q.toque)} d
                      </span>
                    ) : (
                      <span className="font-medium text-red-600">sin toques</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-zinc-500">
                  No hay quejas abiertas en este corte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
