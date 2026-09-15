/**
 * Lo que hace el código y no el modelo.
 *
 * El modelo aporta el juicio —qué máquinas van juntas y por qué—; la aritmética
 * y las garantías las hace esto. Un modelo arma con toda confianza una ruta de
 * once horas y jura que cabe en ocho.
 *
 * Aquí se ordenan las paradas por cercanía, se suma el tiempo real de la
 * jornada y se recorta lo que no quepa, empezando por lo menos prioritario.
 */

export type Punto = { lat: number | null; lng: number | null };

export type ParadaPropuesta = {
  maquina_id: string;
  prioridad: number;
  motivo: string;
};

export type ParadaOrdenada = ParadaPropuesta & {
  orden: number;
  km_desde_anterior: number;
};

export type RutaValidada = {
  operador_id: string;
  paradas: ParadaOrdenada[];
  km_total: number;
  horas_estimadas: number;
  recortadas: { maquina_id: string; motivo: string }[];
};

const RADIO_TIERRA_KM = 6371;

export function distanciaKm(a: Punto, b: Punto): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(s));
}

/**
 * Vecino más cercano desde el CEDIS. Es una heurística: no da el óptimo, pero
 * es estable y explicable, que para una ruta que una persona va a revisar vale
 * más que dos kilómetros menos.
 */
function vecinoMasCercano<T extends Punto>(origen: Punto, puntos: T[]): T[] {
  const pendientes = [...puntos];
  const ruta: T[] = [];
  let actual = origen;

  while (pendientes.length > 0) {
    let mejor = 0;
    let mejorD = Infinity;
    for (let i = 0; i < pendientes.length; i++) {
      const d = distanciaKm(actual, pendientes[i]);
      if (d < mejorD) {
        mejorD = d;
        mejor = i;
      }
    }
    const elegido = pendientes.splice(mejor, 1)[0];
    ruta.push(elegido);
    actual = elegido;
  }
  return ruta;
}

/**
 * 2-opt: deshace los cruces que deja el vecino más cercano. Se corta a 60
 * pasadas porque con 11 paradas converge muchísimo antes y no tiene caso
 * quemar tiempo de función serverless.
 */
function dosOpt<T extends Punto>(origen: Punto, ruta: T[], cerrar: Punto | null): T[] {
  const largo = (r: T[]): number => {
    let total = 0;
    let prev: Punto = origen;
    for (const p of r) {
      total += distanciaKm(prev, p);
      prev = p;
    }
    if (cerrar) total += distanciaKm(prev, cerrar);
    return total;
  };

  let mejor = [...ruta];
  let mejorLargo = largo(mejor);
  let mejoro = true;
  let pasadas = 0;

  while (mejoro && pasadas < 60) {
    mejoro = false;
    pasadas++;
    for (let i = 0; i < mejor.length - 1; i++) {
      for (let j = i + 1; j < mejor.length; j++) {
        const candidato = [
          ...mejor.slice(0, i),
          ...mejor.slice(i, j + 1).reverse(),
          ...mejor.slice(j + 1),
        ];
        const l = largo(candidato);
        if (l < mejorLargo - 0.01) {
          mejor = candidato;
          mejorLargo = l;
          mejoro = true;
        }
      }
    }
  }
  return mejor;
}

export type ParametrosJornada = {
  horasJornada: number;
  minutosCarga: number;
  minutosPorParada: number;
  velocidadKmh: number;
  maxParadas: number;
  regresaAResguardo: boolean;
};

/**
 * Ordena, suma el tiempo y recorta lo que no quepa.
 *
 * El recorte va por prioridad descendente: la parada de menor prioridad es la
 * primera en caer. Se devuelve qué se recortó y por qué, porque una parada que
 * desaparece en silencio es justo lo que nadie quiere descubrir al día
 * siguiente.
 */
export function ordenarYValidar(
  cedis: Punto,
  paradas: (ParadaPropuesta & Punto)[],
  params: ParametrosJornada,
): RutaValidada & { operador_id: string } {
  const recortadas: { maquina_id: string; motivo: string }[] = [];

  // Techo de paradas: lo que sobra se recorta antes de calcular nada.
  let trabajo = [...paradas];
  if (trabajo.length > params.maxParadas) {
    const sobran = [...trabajo]
      .sort((a, b) => b.prioridad - a.prioridad)
      .slice(0, trabajo.length - params.maxParadas);
    for (const s of sobran) {
      recortadas.push({
        maquina_id: s.maquina_id,
        motivo: `Pasa del techo de ${params.maxParadas} paradas del día.`,
      });
    }
    const fuera = new Set(sobran.map((s) => s.maquina_id));
    trabajo = trabajo.filter((p) => !fuera.has(p.maquina_id));
  }

  const calcular = (lista: (ParadaPropuesta & Punto)[]) => {
    const ordenadas = dosOpt(
      cedis,
      vecinoMasCercano(cedis, lista),
      params.regresaAResguardo ? cedis : null,
    );
    let km = 0;
    let prev: Punto = cedis;
    const conOrden: ParadaOrdenada[] = ordenadas.map((p, i) => {
      const d = distanciaKm(prev, p);
      km += d;
      prev = p;
      return {
        maquina_id: p.maquina_id,
        prioridad: p.prioridad,
        motivo: p.motivo,
        orden: i + 1,
        km_desde_anterior: Math.round(d * 10) / 10,
      };
    });
    if (params.regresaAResguardo) km += distanciaKm(prev, cedis);

    const horas =
      params.minutosCarga / 60 +
      (km / params.velocidadKmh) +
      (conOrden.length * params.minutosPorParada) / 60;

    return { conOrden, km, horas };
  };

  let resultado = calcular(trabajo);

  // Si no cabe en la jornada, cae la de menor prioridad y se recalcula. El
  // orden óptimo cambia al quitar una parada, así que no basta con restar.
  while (resultado.horas > params.horasJornada && trabajo.length > 0) {
    const menos = [...trabajo].sort((a, b) => b.prioridad - a.prioridad)[0];
    recortadas.push({
      maquina_id: menos.maquina_id,
      motivo: `La ruta daba ${resultado.horas.toFixed(1)} h y la jornada es de ${params.horasJornada} h.`,
    });
    trabajo = trabajo.filter((p) => p.maquina_id !== menos.maquina_id);
    resultado = calcular(trabajo);
  }

  return {
    operador_id: "",
    paradas: resultado.conOrden,
    km_total: Math.round(resultado.km * 10) / 10,
    horas_estimadas: Math.round(resultado.horas * 100) / 100,
    recortadas,
  };
}
