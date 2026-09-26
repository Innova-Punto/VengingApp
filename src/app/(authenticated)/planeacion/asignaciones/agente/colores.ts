/**
 * Colores por persona, compartidos entre el mapa y la lista de rutas.
 *
 * Vive aparte del mapa a propósito: el mapa importa Leaflet, que toca `window`
 * y no puede cargarse en el servidor. La pantalla necesita los colores para
 * pintar los encabezados, y no tiene por qué arrastrar el mapa para eso.
 *
 * Se asignan por posición y no por nombre: si mañana entra alguien nuevo, toma
 * el siguiente color sin tocar nada.
 */
export const COLORES = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#0891b2"];
