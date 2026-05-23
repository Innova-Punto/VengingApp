# MuscleUp

Plataforma de operación de vending de suplementos. Cubre el ciclo:
**Compra → Recepción → Encartuchado → Planeación → Surtido → Operación de campo → Pesaje → Reconciliación → BI**.

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Backend**: Supabase (Postgres, Auth, Storage, Edge Functions, Realtime)
- **Hosting**: Vercel + Supabase Cloud

## Requisitos locales

- Node.js 20+
- npm 10+
- Docker Desktop (para `supabase start` con stack local)
- Supabase CLI (incluida como devDependency vía `npx supabase`)

## Setup inicial

```bash
# 1. Clonar e instalar
git clone <repo-url>
cd VengingApp
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# Edita .env.local con los valores reales (ver "Variables de entorno")

# 3. (Opcional) Iniciar stack local de Supabase
npm run db:start             # requiere Docker corriendo

# 4. Enlazar al proyecto remoto de Supabase
npm run db:link              # usa SUPABASE_PROJECT_REF
# Te pedirá SUPABASE_DB_PASSWORD.

# 5. Generar tipos TypeScript del esquema (después de tener migraciones)
npm run db:types

# 6. Arrancar Next.js
npm run dev
# → http://localhost:3000
```

## Variables de entorno

Ver `.env.example`. Todas se llenan en `.env.local` (que **no** se versiona).

| Variable | Dónde se usa | Cómo obtenerla |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente + servidor | Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente + servidor | Dashboard → Project Settings → API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo servidor** | Dashboard → Project Settings → API → `service_role` (secreta) |
| `SUPABASE_PROJECT_REF` | Supabase CLI | Dashboard → Project Settings → General → Reference ID |
| `SUPABASE_DB_PASSWORD` | Supabase CLI (push) | Dashboard → Project Settings → Database → password del usuario `postgres` |
| `NEXT_PUBLIC_APP_URL` | redirects de auth | `http://localhost:3000` en dev |

## Flujo de migraciones

Todo cambio de esquema va por archivo SQL versionado en `supabase/migrations/`. **No tocar** el SQL Editor del Dashboard para cambios estructurales.

```bash
npm run db:new -- nombre_descriptivo   # crea migración vacía
npm run db:push                        # aplica a remoto
npm run db:types                       # regenera tipos TS
```

## Documentación clave

- **`docs/muscleup_modelo_datos.md`** — fuente única del modelo de datos (43 tablas, 19 enums). Léelo antes de cualquier cambio de BD.
- **`CLAUDE.md`** — convenciones del proyecto y guía para agentes Claude Code.

## Comandos

```bash
npm run dev          # Next.js dev server
npm run build        # build de producción
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit

npm run db:start     # arranca Supabase local (Docker)
npm run db:stop
npm run db:status
npm run db:link      # enlaza al proyecto remoto
npm run db:new       # crea migración vacía
npm run db:diff      # diff de cambios locales no migrados
npm run db:push      # sube migraciones a remoto
npm run db:reset     # reset del stack local
npm run db:types     # regenera tipos de TS
```
