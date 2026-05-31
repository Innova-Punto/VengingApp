/* eslint-disable @next/next/no-img-element */
/**
 * Logo de Innovaypunto.
 *
 * Renderizado textual con la "Y" estilizada. Cuando el usuario suba una
 * versión SVG o PNG **con fondo transparente** del logo oficial, se puede
 * volver a renderizar como imagen activando `USE_IMAGE = true` y
 * actualizando LOGO_SRC.
 *
 * Por qué texto y no imagen: el archivo que tenemos es JPEG con fondo
 * blanco. Al invertir con filter CSS para que se vea blanco sobre el
 * header navy, el fondo blanco también se invierte y queda blanco
 * (invisible). PNG/SVG con alpha resolvería esto.
 */

const USE_IMAGE = false;
const LOGO_SRC = "/logo-innovaypunto.jfif"; // requiere PNG/SVG transparente para variants oscuros

const SIZES = {
  sm: { name: "text-sm", tag: "text-[8px]", img: 22 },
  md: { name: "text-base", tag: "text-[9px]", img: 32 },
  lg: { name: "text-2xl", tag: "text-[11px]", img: 56 },
  xl: { name: "text-4xl", tag: "text-sm", img: 80 },
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
  showTagline?: boolean;
}) {
  const s = SIZES[size];

  if (USE_IMAGE) {
    const invertir = variant === "default" || variant === "light";
    return (
      <img
        src={LOGO_SRC}
        alt="Innovaypunto"
        height={s.img}
        style={{
          height: `${s.img}px`,
          width: "auto",
          objectFit: "contain",
          filter: invertir ? "brightness(0) invert(1)" : undefined,
        }}
        className={className}
      />
    );
  }

  // Render textual
  const colorBase =
    variant === "dark" ? "text-brand" : "text-white";
  const colorY =
    variant === "dark" ? "text-brand-accent" : "text-brand-accent";

  return (
    <div className={`select-none ${className}`}>
      <div
        className={`${s.name} ${colorBase} font-extrabold leading-none`}
        style={{ letterSpacing: "0.04em" }}
      >
        INNOVA<span className={`${colorY} font-black`}>Y</span>PUNTO
      </div>
      {showTagline && (
        <div
          className={`${s.tag} ${colorBase} opacity-80 mt-1 tracking-[0.22em] font-medium`}
        >
          INNOVAMOS EL PUNTO DE VENTA
        </div>
      )}
    </div>
  );
}
