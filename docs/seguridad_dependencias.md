# Auditoría de dependencias — 15-ago-2026

GitHub/Dependabot reportaba **27 alertas** (14 altas, 13 moderadas). Dependabot cuenta una
alerta por cada ruta del árbol de dependencias; `npm audit` las agrupa en **10 paquetes**.

Este documento registra qué se corrigió, qué **no aplica** a esta app y por qué, y qué queda
pendiente de una decisión de negocio.

## Resultado

| | Antes | Después |
|---|---|---|
| Paquetes vulnerables | 10 (8 altas, 2 moderadas) | **6** (4 altas, 2 moderadas) |
| Vulnerables **en runtime de producción** | 4 | **1** (Next.js) |

Verificado tras los cambios: `typecheck`, `lint` y `build` en verde, y el CSS generado es
**byte-idéntico** al anterior (47,549 bytes) — sin regresión visual.

---

## 1. Corregido (sin breaking changes)

| Paquete | Severidad | Problema | Cómo se corrigió |
|---|---|---|---|
| `brace-expansion` | alta | DoS por expansión exponencial | `npm audit fix` (transitiva) |
| `js-yaml` | alta | DoS cuadrático en merge keys | `npm audit fix` (transitiva) |
| `nanoid` | alta | Loop infinito con size negativo/cero | `npm audit fix` (transitiva) |
| `postcss` | alta | XSS + lectura arbitraria de `.map` vía `sourceMappingURL` | Subida a `^8.5.26` + `override` para eliminar la copia anidada que Next fijaba en 8.4.31 |

Nota sobre `postcss`: Next 14 fija su propia copia en `8.4.31`. Se agregó
`"overrides": { "postcss": "^8.5.26" }` en `package.json` para que toda la app resuelva a la
versión parcheada. El build produce exactamente el mismo CSS.

---

## 2. No aplica a esta app (no se tocó)

### `uuid` < 11.1.1 vía `exceljs` — moderada
El CVE es *"missing buffer bounds check en **v3/v5/v6** cuando se provee `buf`"*.
`exceljs` importa **solo `v4`** (`const {v4: uuidv4} = require('uuid')`, 3 usos) — el generador
aleatorio, que no toma `buf`. **El vector no existe aquí.**

El "fix" que propone npm es `exceljs@3.4.0`, que es un **downgrade** desde la versión actual:
cambiaría el generador de reportes de cierre (`src/lib/cierre-reporte/excel.ts`) a cambio de
cero seguridad. Se descartó.

### `glob`, `eslint-config-next`, `@next/eslint-plugin-next` — altas
Son **devDependencies**: solo corren en `npm run lint` en la máquina del desarrollador y en CI.
**No entran al bundle de producción.** El CVE de `glob` además es del *CLI* (`glob -c/--cmd`),
que este proyecto no invoca. Se resuelven solos cuando se actualice Next.

---

## 3. Pendiente de decisión: Next.js 14.2.35

Es la **única vulnerabilidad que toca el runtime de producción**. Los 21 avisos de Next se
cierran en **15.5.21** (no en 16.x, que es lo que npm propone por ser "latest").

### Exposición real, vector por vector

| CVE | ¿Aplica? | Por qué |
|---|---|---|
| SSRF en `rewrites` | **No** | `next.config.mjs` no define `rewrites` |
| DoS / cache en Image Optimizer (×3) | **No** | No se usa `next/image` con `remotePatterns`; además corre en Vercel, no self-hosted |
| Bypass de Middleware con i18n | **No** | Sin `i18n` y sin Pages Router (solo App Router) |
| XSS con CSP nonces | **No** | La app no usa CSP con nonces |
| XSS en `beforeInteractive` | **No** | No se usa `Script beforeInteractive` |
| SSRF en Server Actions en *custom servers* | **No** | Corre en Vercel, sin servidor custom |
| **DoS en Server Actions / Server Components** | **Sí** | La app usa Server Actions intensivamente |
| **Cache poisoning / confusion en respuestas RSC** | **Parcial** | Mitigado por el cache de Vercel, pero el vector existe |
| **Exposición de endpoints de Server Functions** | **Parcial** | El endpoint queda expuesto, pero **toda** Server Action de negocio valida `requireRole()` y las 63 tablas tienen RLS: no da acceso a datos sin sesión y rol |

**Mitigación ya existente**: se auditaron los 27 archivos con `"use server"`. Los 25 de negocio
empiezan con `requireRole(...)`; los 2 restantes son `login` y `set-password`, que por diseño
corren antes de haber sesión (Supabase Auth valida internamente). Sumado a RLS en base, el
impacto de los vectores "parciales" queda acotado a disponibilidad, no a fuga de datos.

### Qué implica actualizar a 15.5.21

No es un `npm update`; es un proyecto pequeño pero real:

1. **`params` y `searchParams` pasan a ser asíncronos** — hay que `await`-earlos en
   prácticamente **todas** las páginas (la app los usa en casi cada ruta).
2. **React 19**, que arrastra `react-leaflet` 4.2.1 → 5.x (el actual declara `peer react: ^18`).
3. `fetch` deja de cachearse por defecto: revisar dónde se asumía el cache.

**Recomendación**: hacerlo como tarea dedicada, en rama aparte, con prueba end-to-end de la
PWA del operador (check-in, llenado, checklist de servicio) y del cierre mensual antes de
mergear. No conviene mezclarlo con cambios funcionales.

---

## Cómo re-verificar

```bash
npm audit                      # resumen
npm audit --json | less        # detalle por paquete y ruta
npm run typecheck && npm run lint && npm run build
```
