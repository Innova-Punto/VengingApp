import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { correrAgente } from "./agente";
import { construirEstado, type EstadoRuteo } from "./estado";
import { ordenarYValidar, type RutaValidada } from "./optimizador";

/** El plan final que ve Mariana: ya ordenado, medido y recortado a la jornada. */
export type PlanRuta = RutaValidada & {
  operador_id: string;
  operador_nombre: string;
  vehiculo: string | null;
  puesto: string;
  lleva_agua: boolean;
};

export type ResultadoCorrida = {
  propuestaId: string;
  plan: PlanRuta[];
  descartes: string[];
  costoUsd: number;
  duracionMs: number;
};

/** Tope por default si la clave no está en config_global. */
const TOPE_USD_MES_DEFAULT = 75;

/**
 * Lo que lleva gastado el agente en el mes calendario corriente, en dólares.
 *
 * El mes se corta en CDMX, no en UTC: si no, las corridas de la tarde del
 * último día del mes caerían en el siguiente y el número no cuadraría con lo
 * que cualquiera entiende por "este mes".
 */
export async function gastoDelMesUsd(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data } = await supabase.rpc("ruteo_gasto_mes_usd");
  return Number(data ?? 0);
}

/** El tope vigente, para mostrarlo junto al gastado. */
export async function topeUsdMes(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data } = await supabase
    .from("config_global")
    .select("valor")
    .eq("clave", "ruteo_tope_usd_mes")
    .maybeSingle();

  const n = Number(data?.valor);
  return Number.isFinite(n) && n > 0 ? n : TOPE_USD_MES_DEFAULT;
}

/**
 * Una corrida completa: junta el estado, se lo da al modelo, ordena y valida
 * lo que contesta, y guarda todo.
 *
 * Si algo truena, la corrida se guarda igual con el error escrito: una
 * propuesta que nunca apareció y nadie sabe por qué es peor que una fallida.
 */
export async function correrPropuesta(opts: {
  fuente: "cron" | "manual";
  generadaPor?: string | null;
}): Promise<ResultadoCorrida> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  let estado: EstadoRuteo | null = null;

  try {
    estado = await construirEstado();

    if (!estado.cedis) {
      throw new Error("No hay centro de distribución activo configurado.");
    }
    if (estado.personas.length === 0) {
      throw new Error("No hay personas activas en el catálogo de ruteo.");
    }
    // Nunca pedirle un plan al modelo sobre un parque vacío: no es que no haya
    // máquinas, es que algo falló al leerlas. Cuesta dinero y confunde.
    if (estado.maquinas.length === 0) {
      throw new Error(
        "El catálogo de máquinas llegó vacío. No se le pide plan al modelo con un parque vacío: revisa la consulta antes de volver a intentar.",
      );
    }

    // Alarma de fuga, no presupuesto. El tope está muy por encima del gasto
    // normal (~$0.53 por corrida), así que si se dispara es que algo está
    // corriendo solo: un cron en bucle, un reintento desbocado. Se revisa
    // aquí, justo antes de la única línea que cuesta dinero.
    const [gastado, tope] = await Promise.all([gastoDelMesUsd(), topeUsdMes()]);
    if (gastado >= tope) {
      throw new Error(
        `El agente lleva $${gastado.toFixed(2)} USD gastados este mes y el tope está en $${tope.toFixed(2)}. ` +
          "Eso es muchísimo más que el gasto normal (~$0.53 por corrida), así que probablemente algo esté corriendo solo. " +
          "Revisa las corridas del mes; si de verdad hace falta correr más, sube 'ruteo_tope_usd_mes' en configuración.",
      );
    }

    const corrida = await correrAgente(estado);

    const params = estado.parametros;
    const velocidad = params.ruteo_velocidad_kmh ?? 21;
    const horasJornada = estado.contexto.es_sabado
      ? (params.ruteo_horas_jornada ?? 8) / 2
      : params.ruteo_horas_jornada ?? 8;

    const porMaquina = new Map(estado.maquinas.map((m) => [m.id, m]));

    const plan: PlanRuta[] = corrida.respuesta.asignaciones.map((a) => {
      const persona = estado!.personas.find((p) => p.id === a.operador_id)!;
      const paradas = a.paradas
        .map((p) => {
          const m = porMaquina.get(p.maquina_id)!;
          return { ...p, lat: m.lat, lng: m.lng };
        })
        // Sin coordenadas no se puede ordenar por cercanía ni medir la ruta.
        .filter((p) => p.lat != null && p.lng != null);

      const validada = ordenarYValidar(estado!.cedis!, paradas, {
        horasJornada,
        minutosCarga: estado!.cedis!.minutos_carga,
        // Tiempo por parada = lo que tarda dentro + el costo fijo de
        // estacionarse, entrar, salir y desestacionar. El traslado NO va aquí:
        // se calcula con los kilómetros reales de la ruta ya ordenada.
        minutosPorParada:
          persona.minutos_en_sitio + (params.ruteo_min_fijos_parada ?? 14),
        velocidadKmh: velocidad,
        maxParadas: estado!.contexto.es_sabado
          ? persona.max_paradas_sabado
          : persona.max_paradas,
        regresaAResguardo: persona.regresa_a_resguardo,
      });

      return {
        ...validada,
        operador_id: persona.id,
        operador_nombre: persona.nombre,
        vehiculo: persona.vehiculo,
        puesto: persona.puesto,
        lleva_agua: persona.capacidad_garrafones > 0,
      };
    });

    const { data, error } = await supabase
      .from("propuestas_ruteo")
      .insert({
        fecha: estado.contexto.fecha,
        estado: "generada",
        fuente: opts.fuente,
        estado_entrada: estado,
        respuesta: corrida.respuesta,
        plan,
        escalamientos: corrida.respuesta.escalamientos,
        sin_atender: corrida.respuesta.sin_atender,
        notas: corrida.respuesta.notas,
        modelo: corrida.modelo,
        tokens_entrada: corrida.tokensEntrada,
        tokens_salida: corrida.tokensSalida,
        costo_usd: corrida.costoUsd,
        duracion_ms: corrida.duracionMs,
        generada_por: opts.generadaPor ?? null,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Propuesta calculada pero no guardada: ${error.message}`);

    return {
      propuestaId: data.id,
      plan,
      descartes: corrida.descartes,
      costoUsd: corrida.costoUsd,
      duracionMs: corrida.duracionMs,
    };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await supabase.from("propuestas_ruteo").insert({
      fecha: estado?.contexto.fecha ?? new Date().toISOString().slice(0, 10),
      estado: "error",
      fuente: opts.fuente,
      estado_entrada: estado,
      error: mensaje,
      generada_por: opts.generadaPor ?? null,
    });
    throw e;
  }
}
