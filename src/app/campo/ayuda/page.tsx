import { requireRole } from "@/lib/auth";

import { ScreenshotSlot } from "./ScreenshotSlot";

export const metadata = { title: "Manual del operador · Innovaypunto" };

const BUCKET_PUBLIC_PATH =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") +
  "/storage/v1/object/public/manuales-operador";

/**
 * Cada slot tiene un nombre de archivo predecible. Sube la captura al
 * bucket "manuales-operador" con ese nombre exacto (vía Storage del
 * dashboard de Supabase) y aparecerá aquí automáticamente.
 *
 * Formatos sugeridos: JPG o PNG, máx 1080px de ancho, < 500 KB.
 */
type Step = {
  number: string;
  title: string;
  body: string[];
  image?: { file: string; alt: string };
  tip?: string;
};

const SECCIONES: { titulo: string; descripcion?: string; pasos: Step[] }[] = [
  {
    titulo: "1. Antes de salir a ruta",
    pasos: [
      {
        number: "1.1",
        title: "Abre el link en tu celular",
        body: [
          "Abre el navegador (Chrome o Safari) y entra a la URL que te compartió tu supervisor.",
          "Recomendamos guardar el link como acceso directo en la pantalla de inicio (en Chrome: menú → Agregar a pantalla principal).",
        ],
        image: { file: "01-link.jpg", alt: "Pantalla del navegador con la URL" },
      },
      {
        number: "1.2",
        title: "Inicia sesión",
        body: [
          "Captura el correo y contraseña que te asignaron.",
          "Si la contraseña no funciona, escríbele al supervisor antes de continuar (no la cambies tú mismo).",
        ],
        image: { file: "02-login.PNG", alt: "Formulario de login" },
      },
      {
        number: "1.3",
        title: "Permite GPS y cámara",
        body: [
          "La primera vez el celular te pedirá permitir ubicación (GPS) y cámara. Acepta los dos.",
          "Sin GPS no puedes hacer check-in. Sin cámara no puedes subir evidencia.",
        ],
        tip: "Si por error denegaste el permiso: en Chrome → ajustes del sitio → permitir ubicación y cámara.",
      },
    ],
  },
  {
    titulo: "2. Ver tu ruta del día",
    pasos: [
      {
        number: "2.1",
        title: "Pantalla principal: Hoy",
        body: [
          "Al entrar verás la tarjeta 'Hoy' con la fecha y el número de asignaciones que tienes.",
          "Abajo aparece cada ruta asignada con su color, nombre y cantidad de máquinas.",
        ],
        image: { file: "04-hoy.PNG", alt: "Pantalla Hoy con asignaciones" },
      },
      {
        number: "2.2",
        title: "Estados de la ruta",
        body: [
          "**Lista**: el almacén ya te entregó el surtido. Puedes salir a ruta.",
          "**Sin surtir**: el surtido aún no se preparó. Avisa al planeador.",
          "**En curso**: ya iniciaste la jornada hoy.",
          "**Completada**: terminaste de visitar todas las máquinas.",
        ],
      },
    ],
  },
  {
    titulo: "3. Iniciar la jornada",
    pasos: [
      {
        number: "3.1",
        title: "Tap en la ruta",
        body: [
          "Toca la tarjeta de la ruta que vas a hacer. Verás el detalle: lista de máquinas en el orden planeado.",
        ],
        image: { file: "05-detalle-ruta.PNG", alt: "Detalle de ruta con máquinas" },
      },
      {
        number: "3.2",
        title: "Botón 'Iniciar jornada'",
        body: [
          "Cuando estés a punto de salir, toca **Iniciar jornada**. Esto registra la hora de inicio y tu ubicación.",
          "A partir de aquí ya puedes hacer check-in en cada máquina.",
        ],
        image: { file: "06-iniciar.PNG", alt: "Botón Iniciar jornada" },
      },
    ],
  },
  {
    titulo: "4. Visitar una máquina",
    descripcion:
      "Repite estos pasos para cada máquina, en el orden que aparece en la lista.",
    pasos: [
      {
        number: "4.1",
        title: "Selecciona la máquina",
        body: [
          "Toca la máquina que vas a visitar. Si una no está en tu ruta original pero llegaste por excepción, pídele al planeador que la agregue.",
        ],
        image: { file: "07-lista-maquinas.PNG", alt: "Lista de máquinas de la ruta" },
      },
      {
        number: "4.2",
        title: "Check-in (entrada)",
        body: [
          "Asegúrate de estar frente a la máquina. Toca **Check-in**.",
          "Toma la foto de la máquina (debe verse claramente el frente y el código de serie).",
          "El sistema valida tu ubicación contra la dirección registrada. Si la distancia es muy grande, te lo va a avisar.",
        ],
        tip: "Si la máquina cambió de lugar físicamente, levanta una incidencia y avísale al planeador.",
        image: { file: "08-checkin.PNG", alt: "Pantalla de check-in con foto" },
      },
      {
        number: "4.3",
        title: "Pesaje (si la máquina lo requiere)",
        body: [
          "Algunas máquinas obligan a pesar las tolvas en cada visita (las que NO tienen Nayax).",
          "Para cada tolva: pesa el contenido actual (en gramos) y captura el valor.",
          "El sistema calcula automáticamente la diferencia contra el teórico (lo que debería haber) y la registra como merma o sobrante.",
        ],
        tip: "Pesa antes de cargar. El número 'gramos medidos' debe ser lo que hay en la tolva ANTES de echarle producto nuevo.",
        image: { file: "09-pesaje.PNG", alt: "Formulario de pesaje por tolva" },
      },
      {
        number: "4.4",
        title: "Llenado",
        body: [
          "Carga los cartuchos planeados en cada tolva.",
          "Si por algún motivo no cargas todos los cartuchos planeados, captura cuántos sí cargaste. Los que no cargues se contabilizan como devolución a almacén.",
          "Si la máquina lleva vasos, también captura cuántos vasos cargaste.",
        ],
        image: { file: "10-llenado.PNG", alt: "Formulario de llenado por tolva" },
      },
      {
        number: "4.5",
        title: "Reporta una incidencia (opcional)",
        body: [
          "Si encontraste algo raro: máquina con error, producto vencido, dispensador atorado, fuga, fraude, etc., toca **Reportar incidencia**.",
          "Selecciona el tipo, captura una breve descripción y toma foto.",
          "Para incidencias que afecten inventario (cartuchos dañados, robo), también captura la cantidad afectada.",
        ],
        image: { file: "11-incidencia.PNG", alt: "Formulario de incidencia" },
      },
      {
        number: "4.6",
        title: "Checkout (salida)",
        body: [
          "Antes de irte de la máquina, toca **Checkout**.",
          "Toma la foto final de la máquina cerrada y con la lona/cristal limpio.",
          "Marca el checklist:",
          "• **Nayax activo**: el terminal de pago funciona.",
          "• **Máquina limpia**: limpiaste el frente y el dispensador.",
          "• **100% productos activos**: todas las tolvas tienen producto disponible.",
          "Si alguno está en NO, antes de checkout reporta la incidencia correspondiente.",
        ],
        tip: "El checkout es obligatorio para cerrar la visita. Sin foto + checklist el sistema no te deja avanzar.",
        image: { file: "12-checkout.PNG", alt: "Pantalla de checkout con checklist" },
      },
    ],
  },
  {
    titulo: "5. Cierre del día",
    pasos: [
      {
        number: "5.1",
        title: "Visitar la última máquina",
        body: [
          "Cuando termines la última máquina de la ruta y le des checkout, el sistema marca tu jornada como 'completada' automáticamente.",
        ],
        image: { file: "13-completada.PNG", alt: "Ruta completada" },
      },
      {
        number: "5.2",
        title: "Devolución de cartuchos no usados",
        body: [
          "Cuando regreses al almacén, entrega los cartuchos que no cargaste.",
          "El sistema ya generó la lista de devolución automáticamente con base en lo que reportaste en llenado. El almacén te confirmará la recepción.",
        ],
      },
      {
        number: "5.3",
        title: "Cerrar sesión",
        body: [
          "Toca tu nombre en la esquina superior y luego **Salir**.",
          "Si vas a usar el mismo celular al día siguiente, no es necesario cerrar sesión.",
        ],
      },
    ],
  },
  {
    titulo: "Consejos generales",
    pasos: [
      {
        number: "✓",
        title: "Antes de salir",
        body: [
          "Revisa que el celular tenga batería ≥ 70% o lleva cargador.",
          "Verifica que los cartuchos del surtido estén completos.",
          "Lleva una toalla para limpiar y la balanza si tu ruta tiene máquinas con pesaje obligatorio.",
        ],
      },
      {
        number: "✓",
        title: "En ruta",
        body: [
          "Sigue el orden de la ruta. Si necesitas cambiarlo, avísale antes al supervisor.",
          "No saltes ningún paso del flujo (check-in → pesaje → llenado → checkout). El sistema audita todo.",
          "Si hay problemas con la app, escríbele al supervisor con captura de pantalla.",
        ],
      },
      {
        number: "✓",
        title: "Si no tienes internet",
        body: [
          "El sistema requiere conexión. Si pierdes señal momentáneamente: espera un par de minutos y reintenta.",
          "Si la zona no tiene cobertura, anota manualmente lo que hiciste y captura en la app cuando recuperes señal (lo más pronto posible — el GPS y la hora se registran al momento del envío).",
        ],
      },
    ],
  },
];

export default async function ManualOperadorPage() {
  await requireRole("operador", "admin", "direccion");

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Manual del operador
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Guía paso a paso del flujo en campo: desde abrir la app hasta cerrar
          la última visita.
        </p>
      </div>

      {SECCIONES.map((sec) => (
        <section key={sec.titulo} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              {sec.titulo}
            </h2>
            {sec.descripcion && (
              <p className="mt-1 text-sm text-zinc-600">{sec.descripcion}</p>
            )}
          </div>

          <div className="space-y-3">
            {sec.pasos.map((p) => (
              <article
                key={p.number}
                className="rounded-lg border border-zinc-200 bg-white p-4"
              >
                <header className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-medium text-zinc-400">
                    {p.number}
                  </span>
                  <h3 className="text-base font-semibold text-zinc-900">
                    {p.title}
                  </h3>
                </header>

                <div className="mt-2 space-y-1.5 text-sm text-zinc-700">
                  {p.body.map((b, i) => (
                    <p
                      key={i}
                      className="leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: renderInline(b),
                      }}
                    />
                  ))}
                </div>

                {p.tip && (
                  <p className="mt-2 rounded-md border-l-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    💡 {p.tip}
                  </p>
                )}

                {p.image && (
                  <div className="mt-3">
                    <ScreenshotSlot
                      url={`${BUCKET_PUBLIC_PATH}/${p.image.file}`}
                      file={p.image.file}
                      alt={p.image.alt}
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
        Las capturas se cargan automáticamente desde el bucket{" "}
        <code className="rounded bg-zinc-100 px-1">manuales-operador</code> en
        Supabase Storage. Si ves un placeholder, falta subir esa imagen al
        bucket con el nombre exacto indicado.
      </div>
    </div>
  );
}

function renderInline(text: string): string {
  // bold simple **texto**
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

