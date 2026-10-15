import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { EstadoRuteo } from "./estado";
import { construirMensajeUsuario, construirSystemPrompt } from "./prompt";

/** Lo que contesta el modelo, antes de que el código lo ordene y valide. */
export type RespuestaAgente = {
  asignaciones: {
    operador_id: string;
    paradas: { maquina_id: string; prioridad: number; motivo: string }[];
  }[];
  escalamientos: { maquina_id: string; motivo: string }[];
  sin_atender: { maquina_id: string; motivo: string }[];
  notas: string;
};

export type CorridaAgente = {
  respuesta: RespuestaAgente;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
  duracionMs: number;
};

const MODELO = "claude-opus-5";

// Tarifas de Claude Opus 5 por millón de tokens. Se guardan con cada corrida
// para que el costo del agente sea un dato y no una estimación de sobremesa.
const USD_POR_MTOK_ENTRADA = 5;
const USD_POR_MTOK_SALIDA = 25;

/**
 * El modelo devuelve texto. Aunque se le pida JSON puro, a veces envuelve la
 * respuesta en un bloque de código: se limpia antes de parsear en lugar de
 * fallar por una cerca de backticks.
 */
function extraerJSON(texto: string): unknown {
  const limpio = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(limpio);
  } catch {
    // Último recurso: el primer objeto balanceado que aparezca.
    const ini = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");
    if (ini >= 0 && fin > ini) return JSON.parse(limpio.slice(ini, fin + 1));
    throw new Error("El modelo no devolvió JSON interpretable.");
  }
}

/**
 * Valida la forma de la respuesta contra el estado real: un id que no existe
 * es una máquina inventada, y prefiero descartarla aquí que mandar a un
 * operador a una dirección que no existe.
 */
function validarRespuesta(
  bruta: unknown,
  estado: EstadoRuteo,
): { respuesta: RespuestaAgente; descartes: string[] } {
  const descartes: string[] = [];
  const r = bruta as Partial<RespuestaAgente>;

  const idsMaquina = new Set(estado.maquinas.map((m) => m.id));
  const idsPersona = new Set(estado.personas.map((p) => p.id));
  const yaAsignadas = new Set<string>();

  const asignaciones = (Array.isArray(r.asignaciones) ? r.asignaciones : [])
    .filter((a) => {
      if (!idsPersona.has(a?.operador_id)) {
        descartes.push(`Operador inexistente en la propuesta: ${a?.operador_id}`);
        return false;
      }
      return true;
    })
    .map((a) => ({
      operador_id: a.operador_id,
      paradas: (Array.isArray(a.paradas) ? a.paradas : []).filter((p) => {
        if (!idsMaquina.has(p?.maquina_id)) {
          descartes.push(`Máquina inexistente: ${p?.maquina_id}`);
          return false;
        }
        // Una máquina en dos rutas el mismo día es surtido duplicado.
        if (yaAsignadas.has(p.maquina_id)) {
          descartes.push(`Máquina repetida en dos rutas: ${p.maquina_id}`);
          return false;
        }
        yaAsignadas.add(p.maquina_id);
        return true;
      }),
    }));

  const limpiarLista = (lista: unknown): { maquina_id: string; motivo: string }[] =>
    (Array.isArray(lista) ? lista : [])
      .filter(
        (x: { maquina_id?: string }) => !!x?.maquina_id && idsMaquina.has(x.maquina_id),
      )
      .map((x: { maquina_id: string; motivo?: string }) => ({
        maquina_id: x.maquina_id,
        motivo: String(x.motivo ?? "").trim() || "Sin motivo declarado.",
      }));

  return {
    respuesta: {
      asignaciones,
      escalamientos: limpiarLista(r.escalamientos),
      sin_atender: limpiarLista(r.sin_atender),
      notas: String(r.notas ?? "").trim(),
    },
    descartes,
  };
}

export async function correrAgente(
  estado: EstadoRuteo,
): Promise<CorridaAgente & { descartes: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en el entorno. Sin esa variable el agente de ruteo no puede correr.",
    );
  }

  const client = new Anthropic();
  const inicio = Date.now();

  // En streaming y no de un jalón: la respuesta es larga —cuatro rutas con su
  // motivo, escalamientos y notas— y una petición que tarda minutos sin decir
  // nada se corta sola. El stream mantiene viva la conexión mientras escribe.
  //
  // El tope arrancó en 16,000 y nunca tuvo holgura: las corridas buenas de
  // septiembre gastaron entre 12,620 y 15,449 tokens de salida. La mejor pasó a
  // 551 tokens del techo. En cuanto el parque y las emergencias crecieron, el
  // plan dejó de caber y todas las corridas empezaron a morir cortadas.
  //
  // 64,000 es el default recomendado para peticiones en streaming (sin stream,
  // el tope prudente es ~16,000 por los timeouts de HTTP, pero aquí no aplica).
  // El modelo admite hasta 128,000. Subirlo no encarece nada por sí solo: se
  // paga lo que de verdad se genera, no el tope.
  const stream = client.messages.stream({
    model: MODELO,
    max_tokens: 64000,
    system: construirSystemPrompt(estado),
    messages: [{ role: "user", content: construirMensajeUsuario(estado) }],
  });
  const respuestaApi = await stream.finalMessage();

  const duracionMs = Date.now() - inicio;

  if (respuestaApi.stop_reason === "refusal") {
    throw new Error("El modelo declinó la solicitud.");
  }

  // Se quedó sin espacio a media respuesta: el JSON viene cortado y al
  // intentar leerlo sale un error de sintaxis que no explica nada. Ya pasó.
  //
  // Con el tope en 64,000 esto ya no es un tropiezo de suerte: si se dispara,
  // el plan creció de verdad y reintentar no lo va a arreglar. El mensaje dice
  // cuánto gastó para que el dato esté a la mano y no haya que ir a buscarlo.
  if (respuestaApi.stop_reason === "max_tokens") {
    throw new Error(
      `La respuesta del modelo se cortó por longitud a los ${respuestaApi.usage.output_tokens.toLocaleString("es-MX")} tokens: el plan quedó incompleto. Reintentar no ayuda — avisa a sistemas para revisar el tope.`,
    );
  }

  const texto = respuestaApi.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const { respuesta, descartes } = validarRespuesta(extraerJSON(texto), estado);

  const tokensEntrada = respuestaApi.usage.input_tokens;
  const tokensSalida = respuestaApi.usage.output_tokens;

  return {
    respuesta,
    descartes,
    modelo: MODELO,
    tokensEntrada,
    tokensSalida,
    costoUsd:
      Math.round(
        ((tokensEntrada / 1_000_000) * USD_POR_MTOK_ENTRADA +
          (tokensSalida / 1_000_000) * USD_POR_MTOK_SALIDA) *
          10_000,
      ) / 10_000,
    duracionMs,
  };
}
