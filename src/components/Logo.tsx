/**
 * Logo de Innovaypunto.
 * Reemplazar por el SVG/PNG oficial cuando esté disponible (sustituye este
 * componente o pásale otra `variant` con un <Image src="/logo.svg" ... />).
 *
 * Variantes:
 *  - "default" : color blanco con la Y en teal (uso sobre fondo navy)
 *  - "dark"    : todo en navy (uso sobre fondo blanco)
 *  - "light"   : todo en blanco (sin acento, sobre cualquier fondo oscuro)
 */
export function Logo({
  variant = "default",
  showTagline = true,
  size = "md",
  className = "",
}: {
  variant?: "default" | "dark" | "light";
  showTagline?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: { name: "text-sm", tag: "text-[8px]" },
    md: { name: "text-base", tag: "text-[9px]" },
    lg: { name: "text-2xl", tag: "text-[11px]" },
    xl: { name: "text-4xl", tag: "text-sm" },
  }[size];

  const baseColor =
    variant === "dark"
      ? "text-brand"
      : variant === "light"
        ? "text-white"
        : "text-white";

  const yColor =
    variant === "light"
      ? "text-white"
      : variant === "dark"
        ? "text-brand-accent"
        : "text-brand-accent";

  return (
    <div className={`select-none ${className}`}>
      <div
        className={`${sizes.name} ${baseColor} font-extrabold tracking-tight leading-none`}
        style={{ letterSpacing: "0.02em" }}
      >
        INNOVA<span className={`${yColor} font-black`}>Y</span>PUNTO
      </div>
      {showTagline && (
        <div
          className={`${sizes.tag} ${baseColor} opacity-80 mt-0.5 tracking-[0.18em] font-medium`}
        >
          INNOVAMOS EL PUNTO DE VENTA
        </div>
      )}
    </div>
  );
}
