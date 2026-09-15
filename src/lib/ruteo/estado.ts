import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * El estado del parque que se le entrega al agente de ruteo.
 *
 * Todo lo que el modelo sabe sale de aquí: no consulta nada por su cuenta. Si
 * un criterio del prompt no tiene su dato en este objeto, el modelo lo va a
 * ignorar o —peor— lo va a inventar.
 */

export type MaquinaEstado = {
  id: string;
  serie: string;
  alias: string | null;
  tipo: string;
  cliente: string | null;
  ubicacion: string | null;
  lat: number | null;
  lng: number | null;
  criticidad: string | null;
  tolvas_cortas: number;
  dias_para_vaciarse: number | null;
  hueco_cartuchos: number;
  horas_sin_venta: number | null;
  abierta_ahora: boolean;
  dias_sin_visita: number | null;
  visita_vencida: boolean;
  venta_diaria_mxn: number;
  vasos_disponibles: number;
  agua_dias: number | null;
  agua_sin_medicion: boolean;
  /** Días desde la última carga de agua. null = nunca se le ha cargado. */
  dias_sin_agua: number | null;
  /**
   * Días desde que el supervisor pisó esta máquina. null = nunca.
   * El barrido de la camioneta se mide con esto: el objetivo es que Diego
   * revise todo el parque en 5 semanas, y el agua es lo que lo lleva ahí.
   */
  dias_sin_supervision: number | null;
  incidencias_abiertas: number;
  quejas_abiertas: number;
  quejas_tecnicas_30d: number;
};

export type PersonaEstado = {
  id: string;
  nombre: string;
  puesto: string;
  vehiculo: string | null;
  capacidad_cartuchos: number | null;
  capacidad_garrafones: number;
  regresa_a_resguardo: boolean;
  max_paradas: number;
  max_paradas_sabado: number;
  /**
   * Minutos DENTRO de la máquina. No incluye traslado ni el costo fijo de
   * estacionarse: esos se suman aparte, con la geometría real de la ruta.
   */
  minutos_en_sitio: number;
};

export type EstadoRuteo = {
  contexto: {
    fecha: string;
    dia_semana: string;
    es_sabado: boolean;
  };
  cedis: {
    nombre: string;
    lat: number;
    lng: number;
    minutos_carga: number;
  } | null;
  parametros: Record<string, number>;
  personas: PersonaEstado[];
  maquinas: MaquinaEstado[];
};

const DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/** Fecha de hoy en CDMX, que es el día que se está planeando. */
export function hoyCDMX(): Date {
  const s = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });
  return new Date(s);
}

export async function construirEstado(): Promise<EstadoRuteo> {
  // Cliente admin: el cron corre sin sesión de usuario.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const hoy = hoyCDMX();
  const fecha = hoy.toISOString().slice(0, 10);

  // Quién supervisa hoy. Sale del catálogo y no de un nombre escrito a mano:
  // si mañana hay dos supervisores, el barrido los toma a los dos.
  const { data: supervisores } = await supabase
    .from("operadores_ruteo")
    .select("operador_id")
    .eq("puesto", "supervisor")
    .eq("activo", true);
  const idsSupervisores: string[] = (supervisores ?? []).map(
    (s: { operador_id: string }) => s.operador_id,
  );

  const [
    { data: sugerencias },
    { data: config },
    { data: cedisRows },
    { data: operadores },
    { data: aguaRows },
    { data: quejasRows },
    { data: incidenciasRows },
    { data: maquinasRows },
    { data: ventasRows },
    { data: visitasSupervisor },
    { data: cargasAgua },
  ] = await Promise.all([
    supabase.rpc("sugerencia_ruteo_diaria"),
    supabase.from("config_global").select("clave, valor, tipo_dato"),
    supabase
      .from("centros_distribucion")
      .select("nombre, lat, lng, minutos_carga")
      .eq("activo", true)
      .limit(1),
    supabase
      .from("operadores_ruteo")
      .select(
        `operador_id, puesto, max_paradas, max_paradas_sabado, min_en_sitio_estimado,
         operador:profiles(full_name),
         vehiculo:vehiculos(identificador, tipo, capacidad_cartuchos, capacidad_garrafones, regresa_a_resguardo)`,
      )
      .eq("activo", true),
    supabase
      .from("v_agua_maquina")
      .select("maquina_id, dias_para_vaciarse, sin_medicion"),
    supabase
      .from("v_quejas_por_maquina")
      .select("maquina_id, quejas_abiertas, quejas_tecnicas_30d"),
    supabase
      .from("incidencias")
      .select("maquina_id")
      .in("estado", ["abierta", "en_revision"]),
    supabase
      .from("maquinas")
      .select("id, vaso_inventario_actual")
      .eq("activo", true),
    // Última visita del supervisor por máquina: el barrido de 5 semanas se
    // mide contra esto, no contra la visita de cualquiera.
    supabase
      .from("check_ins")
      .select("maquina_id, fecha_entrada")
      .in("operador_id", idsSupervisores)
      .order("fecha_entrada", { ascending: false })
      .limit(2000),
    // Última carga de agua por máquina: es lo que hace cumplible el barrido
    // de 5 semanas sin que nadie tenga que acordarse de a quién le toca.
    supabase
      .from("agua_maquina_eventos")
      .select("maquina_id, fecha")
      .eq("tipo", "carga")
      .order("fecha", { ascending: false }),
    // Venta diaria promedio de 30 días: es el desempate del prompt.
    supabase.rpc("venta_diaria_por_maquina_30d"),
  ]);

  const parametros: Record<string, number> = {};
  for (const c of config ?? []) {
    if (c.tipo_dato === "numero") {
      const n = Number(c.valor);
      if (Number.isFinite(n)) parametros[c.clave] = n;
    }
  }

  const aguaPorMaquina = new Map<string, { dias: number | null; sin: boolean }>();
  for (const a of aguaRows ?? []) {
    aguaPorMaquina.set(a.maquina_id, {
      dias: a.dias_para_vaciarse != null ? Number(a.dias_para_vaciarse) : null,
      sin: !!a.sin_medicion,
    });
  }

  const quejasPorMaquina = new Map<string, { abiertas: number; tecnicas: number }>();
  for (const q of quejasRows ?? []) {
    quejasPorMaquina.set(q.maquina_id, {
      abiertas: Number(q.quejas_abiertas ?? 0),
      tecnicas: Number(q.quejas_tecnicas_30d ?? 0),
    });
  }

  const incidenciasPorMaquina = new Map<string, number>();
  for (const i of incidenciasRows ?? []) {
    if (!i.maquina_id) continue;
    incidenciasPorMaquina.set(
      i.maquina_id,
      (incidenciasPorMaquina.get(i.maquina_id) ?? 0) + 1,
    );
  }

  const vasosPorMaquina = new Map<string, number>();
  for (const m of maquinasRows ?? []) {
    vasosPorMaquina.set(m.id, Number(m.vaso_inventario_actual ?? 0));
  }

  // La consulta viene ordenada por fecha descendente: la primera de cada
  // máquina es la última carga.
  const ultimaSupervision = new Map<string, string>();
  for (const v of visitasSupervisor ?? []) {
    if (!ultimaSupervision.has(v.maquina_id)) {
      ultimaSupervision.set(v.maquina_id, v.fecha_entrada);
    }
  }

  const ultimaCargaAgua = new Map<string, string>();
  for (const c of cargasAgua ?? []) {
    if (!ultimaCargaAgua.has(c.maquina_id)) {
      ultimaCargaAgua.set(c.maquina_id, c.fecha);
    }
  }
  const diasDesde = (iso: string | undefined): number | null =>
    iso == null
      ? null
      : Math.round(((Date.now() - new Date(iso).getTime()) / 86_400_000) * 10) / 10;

  const ventaPorMaquina = new Map<string, number>();
  for (const v of (ventasRows ?? []) as { maquina_id: string; venta_dia: number }[]) {
    ventaPorMaquina.set(v.maquina_id, Number(v.venta_dia ?? 0));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maquinas: MaquinaEstado[] = ((sugerencias ?? []) as any[])
    // Las de servicio no cuentan contra el techo de paradas de surtido: son
    // otra visita, con checklist y firma, y no venden.
    .filter((m) => m.tipo !== "servicio")
    .map((m) => {
      const agua = aguaPorMaquina.get(m.maquina_id);
      const quejas = quejasPorMaquina.get(m.maquina_id);
      return {
        id: m.maquina_id,
        serie: m.serie,
        alias: m.alias,
        tipo: m.tipo,
        cliente: m.cliente ?? null,
        ubicacion: m.ubicacion ?? null,
        lat: m.lat != null ? Number(m.lat) : null,
        lng: m.lng != null ? Number(m.lng) : null,
        criticidad: m.criticidad ?? null,
        tolvas_cortas: Number(m.tolvas_cortas ?? 0),
        dias_para_vaciarse:
          m.dias_min_vaciado != null ? Number(m.dias_min_vaciado) : null,
        hueco_cartuchos: Number(m.hueco_max_cartuchos ?? 0),
        horas_sin_venta:
          m.horas_sin_venta != null ? Number(m.horas_sin_venta) : null,
        abierta_ahora: !!m.abierta_ahora,
        dias_sin_visita:
          m.dias_sin_visita != null ? Number(m.dias_sin_visita) : null,
        visita_vencida: !!m.visita_vencida,
        venta_diaria_mxn: Math.round(ventaPorMaquina.get(m.maquina_id) ?? 0),
        vasos_disponibles: vasosPorMaquina.get(m.maquina_id) ?? 0,
        agua_dias: agua?.dias ?? null,
        agua_sin_medicion: agua?.sin ?? true,
        dias_sin_agua: diasDesde(ultimaCargaAgua.get(m.maquina_id)),
        dias_sin_supervision: diasDesde(ultimaSupervision.get(m.maquina_id)),
        incidencias_abiertas: incidenciasPorMaquina.get(m.maquina_id) ?? 0,
        quejas_abiertas: quejas?.abiertas ?? 0,
        quejas_tecnicas_30d: quejas?.tecnicas ?? 0,
      };
    });

  const esSabado = hoy.getDay() === 6;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personas: PersonaEstado[] = ((operadores ?? []) as any[]).map((o) => {
    const perfil = Array.isArray(o.operador) ? o.operador[0] : o.operador;
    const veh = Array.isArray(o.vehiculo) ? o.vehiculo[0] : o.vehiculo;
    const esSupervisor = o.puesto === "supervisor";
    return {
      id: o.operador_id,
      nombre: perfil?.full_name ?? "—",
      puesto: o.puesto ?? "operador",
      vehiculo: veh?.identificador ?? null,
      // null = sin tope práctico (la camioneta).
      capacidad_cartuchos: veh?.capacidad_cartuchos ?? null,
      // Solo la camioneta reparte agua. Las motos van en 0 y por eso las
      // máquinas con agua baja solo pueden entrar a la ruta de quien sí carga.
      capacidad_garrafones: Number(veh?.capacidad_garrafones ?? 0),
      regresa_a_resguardo: !!veh?.regresa_a_resguardo,
      max_paradas: Number(o.max_paradas ?? 11),
      max_paradas_sabado: Number(o.max_paradas_sabado ?? 5),
      // OJO: `ruteo_min_por_parada_*` (40 y 63.8) son el total puerta a puerta,
      // traslado incluido. Aquí NO se usan: como sí tenemos coordenadas, el
      // traslado se calcula con la ruta real. Usarlos sería cobrarlo dos veces.
      minutos_en_sitio: Number(
        o.min_en_sitio_estimado ?? (esSupervisor ? 28.6 : 20.3),
      ),
    };
  });

  const cedis = (cedisRows ?? [])[0];

  return {
    contexto: {
      fecha,
      dia_semana: DIAS[hoy.getDay()],
      es_sabado: esSabado,
    },
    cedis: cedis
      ? {
          nombre: cedis.nombre,
          lat: Number(cedis.lat),
          lng: Number(cedis.lng),
          minutos_carga: Number(cedis.minutos_carga ?? 20),
        }
      : null,
    parametros,
    personas,
    maquinas,
  };
}
