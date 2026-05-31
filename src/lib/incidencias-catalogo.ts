/**
 * Catálogo enriquecido de tipos de incidencia.
 *
 * Es estático porque el tipo subyacente es un enum de Postgres
 * (`public.incidencia_tipo`). Para agregar un tipo nuevo hay que:
 *   1. Migrar con `alter type incidencia_tipo add value '...';`
 *   2. Agregar el item correspondiente aquí.
 */

export type IncidenciaTipo =
  | "maquina_apagada"
  | "sin_conexion_nayax"
  | "tolva_atascada"
  | "producto_compactado"
  | "vandalismo"
  | "falta_vasos"
  | "producto_contaminado"
  | "acceso_denegado"
  | "queja_cliente"
  | "cartucho_danado"
  | "cartucho_perdido"
  | "discrepancia_devolucion"
  | "desviacion_calibracion"
  | "vaso_atorado"
  | "falta_de_agua"
  | "otro";

export type IncidenciaCategoria =
  | "tecnica"
  | "mantenimiento"
  | "inventario"
  | "calidad"
  | "logistica"
  | "externa"
  | "comercial"
  | "sistema"
  | "otro";

export type IncidenciaCatalogoItem = {
  tipo: IncidenciaTipo;
  label: string;
  categoria: IncidenciaCategoria;
  descripcion: string;
  impactaInventario: boolean;
  severidadDefault: "baja" | "media" | "alta";
};

export const INCIDENCIAS_CATALOGO: IncidenciaCatalogoItem[] = [
  {
    tipo: "maquina_apagada",
    label: "Máquina apagada",
    categoria: "tecnica",
    descripcion: "La máquina no enciende o está sin energía al llegar.",
    impactaInventario: false,
    severidadDefault: "alta",
  },
  {
    tipo: "sin_conexion_nayax",
    label: "Sin conexión Nayax",
    categoria: "tecnica",
    descripcion: "El módulo Nayax no responde o no transmite ventas.",
    impactaInventario: false,
    severidadDefault: "media",
  },
  {
    tipo: "tolva_atascada",
    label: "Tolva atascada",
    categoria: "mantenimiento",
    descripcion: "Una o varias tolvas no liberan producto correctamente.",
    impactaInventario: false,
    severidadDefault: "media",
  },
  {
    tipo: "vaso_atorado",
    label: "Vaso atorado",
    categoria: "mantenimiento",
    descripcion: "El dispensador de vasos no libera o queda atorado.",
    impactaInventario: false,
    severidadDefault: "media",
  },
  {
    tipo: "falta_de_agua",
    label: "Falta de agua",
    categoria: "tecnica",
    descripcion:
      "La máquina no tiene suministro de agua o el depósito está vacío.",
    impactaInventario: false,
    severidadDefault: "alta",
  },
  {
    tipo: "producto_compactado",
    label: "Producto compactado",
    categoria: "mantenimiento",
    descripcion:
      "El polvo dentro de la tolva se compactó por humedad o tiempo. Requiere limpieza.",
    impactaInventario: false,
    severidadDefault: "baja",
  },
  {
    tipo: "vandalismo",
    label: "Vandalismo",
    categoria: "externa",
    descripcion:
      "Daño intencional a la máquina o robo de producto. Estimar cartuchos afectados y conservar evidencia.",
    impactaInventario: true,
    severidadDefault: "alta",
  },
  {
    tipo: "falta_vasos",
    label: "Falta de vasos",
    categoria: "logistica",
    descripcion: "La máquina se quedó sin vasos antes de la siguiente visita.",
    impactaInventario: false,
    severidadDefault: "media",
  },
  {
    tipo: "producto_contaminado",
    label: "Producto contaminado",
    categoria: "calidad",
    descripcion:
      "El producto dentro de la tolva está alterado (humedad, cuerpo extraño, etc.). Retirar y reportar cartuchos a mermar.",
    impactaInventario: true,
    severidadDefault: "alta",
  },
  {
    tipo: "acceso_denegado",
    label: "Acceso denegado",
    categoria: "externa",
    descripcion:
      "El operador no pudo entrar al sitio (cliente cerrado, sin llave, etc.).",
    impactaInventario: false,
    severidadDefault: "media",
  },
  {
    tipo: "queja_cliente",
    label: "Queja de cliente",
    categoria: "comercial",
    descripcion:
      "Cliente final reportó algún problema con el producto o servicio.",
    impactaInventario: false,
    severidadDefault: "media",
  },
  {
    tipo: "cartucho_danado",
    label: "Cartucho dañado",
    categoria: "calidad",
    descripcion:
      "Uno o más cartuchos llegaron rotos o no se pueden usar. Reportar cantidad para merma.",
    impactaInventario: true,
    severidadDefault: "media",
  },
  {
    tipo: "cartucho_perdido",
    label: "Cartucho perdido",
    categoria: "inventario",
    descripcion:
      "Cartuchos que no se cargaron ni regresaron. Investigar antes de autorizar merma.",
    impactaInventario: true,
    severidadDefault: "alta",
  },
  {
    tipo: "discrepancia_devolucion",
    label: "Discrepancia en devolución",
    categoria: "sistema",
    descripcion:
      "Generada automáticamente al recibir una devolución con cantidad distinta a la calculada. Cartuchos faltantes ya están fuera contablemente; al autorizar no se descuenta de nuevo.",
    impactaInventario: false,
    severidadDefault: "media",
  },
  {
    tipo: "desviacion_calibracion",
    label: "Desviación de calibración",
    categoria: "mantenimiento",
    descripcion:
      "La cantidad dispensada por la máquina no coincide con el gramaje configurado.",
    impactaInventario: false,
    severidadDefault: "media",
  },
  {
    tipo: "otro",
    label: "Otro",
    categoria: "otro",
    descripcion: "Cualquier evento no cubierto por los tipos anteriores.",
    impactaInventario: false,
    severidadDefault: "baja",
  },
];

export const CATEGORIA_LABEL: Record<IncidenciaCategoria, string> = {
  tecnica: "Técnica",
  mantenimiento: "Mantenimiento",
  inventario: "Inventario",
  calidad: "Calidad",
  logistica: "Logística",
  externa: "Externa",
  comercial: "Comercial",
  sistema: "Sistema",
  otro: "Otro",
};

export const CATEGORIA_COLOR: Record<IncidenciaCategoria, string> = {
  tecnica: "bg-blue-100 text-blue-700",
  mantenimiento: "bg-amber-100 text-amber-700",
  inventario: "bg-red-100 text-red-700",
  calidad: "bg-red-100 text-red-700",
  logistica: "bg-zinc-100 text-zinc-700",
  externa: "bg-purple-100 text-purple-700",
  comercial: "bg-pink-100 text-pink-700",
  sistema: "bg-zinc-100 text-zinc-600",
  otro: "bg-zinc-100 text-zinc-600",
};

export function getIncidenciaTipoInfo(
  tipo: string,
): IncidenciaCatalogoItem | undefined {
  return INCIDENCIAS_CATALOGO.find((i) => i.tipo === tipo);
}
