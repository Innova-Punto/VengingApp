/* eslint-disable @next/next/no-img-element */
/**
 * Logo de Innovaypunto.
 *
 * Usa el archivo en /public/logo-innovaypunto.jfif (JPEG con tagline ya
 * incluido). Para sustituir por una versión oficial diferente, cambia la
 * constante LOGO_SRC.
 *
 * Variantes:
 *  - "default" / "light" : invierte a blanco con filter (sobre fondos oscuros)
 *  - "dark"              : logo en navy original (sobre fondo blanco)
 */
const LOGO_SRC = "/logo-innovaypunto.jfif";

const HEIGHTS = {
  sm: 28,
  md: 40,
  lg: 64,
  xl: 96,
};

export function Logo({
  variant = "default",
  size = "md",
  className = "",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  showTagline = true,
}: {
  variant?: "default" | "dark" | "light";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** El tagline ya viene incluido en el archivo del logo; el prop se mantiene
   * por compatibilidad pero no afecta el render. */
  showTagline?: boolean;
}) {
  const h = HEIGHTS[size];
  const invertir = variant === "default" || variant === "light";

  return (
    <img
      src={LOGO_SRC}
      alt="Innovaypunto"
      height={h}
      style={{
        height: `${h}px`,
        width: "auto",
        objectFit: "contain",
        // Convierte el logo navy a blanco puro cuando se necesita
        filter: invertir ? "brightness(0) invert(1)" : undefined,
      }}
      className={className}
    />
  );
}
