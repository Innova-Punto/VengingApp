/* eslint-disable @next/next/no-img-element */
/**
 * Logo de Innovaypunto (imagen oficial con fondo transparente).
 *
 * Activos en /public:
 *   - logo-innovaypunto-wordmark.png  → solo "INNOVAYPUNTO" blanco (headers)
 *   - logo-innovaypunto.png           → wordmark + tagline blanco (login, fondos oscuros)
 *   - logo-innovaypunto-dark.png      → wordmark + tagline navy (fondos claros)
 *
 * Todos son blancos/navy sobre transparente, así que NO se aplican filtros.
 */

const WORDMARK_RATIO = 3443 / 498; // ancho/alto del crop wordmark
const FULL_RATIO = 3664 / 1120; // ancho/alto del logo completo

const HEIGHTS = {
  sm: 30,
  md: 42,
  lg: 64,
  xl: 96,
};

export function Logo({
  variant = "default",
  size = "md",
  className = "",
  showTagline = true,
}: {
  variant?: "default" | "dark" | "light";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Si true usa el logo con tagline; si false solo el wordmark. */
  showTagline?: boolean;
}) {
  const h = HEIGHTS[size];

  // variant "dark" = logo navy (para fondos claros). Resto = blanco.
  const src = showTagline
    ? variant === "dark"
      ? "/logo-innovaypunto-dark.png"
      : "/logo-innovaypunto.png"
    : "/logo-innovaypunto-wordmark.png";

  const ratio = showTagline ? FULL_RATIO : WORDMARK_RATIO;

  return (
    <img
      src={src}
      alt="Innovaypunto"
      height={h}
      width={Math.round(h * ratio)}
      style={{ height: `${h}px`, width: "auto", objectFit: "contain" }}
      className={className}
    />
  );
}
