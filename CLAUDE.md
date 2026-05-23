# CLAUDE.md — Convenciones del proyecto MuscleUp

> Documento operativo para agentes (Claude Code) trabajando en este repo.
> Lee primero `docs/muscleup_modelo_datos.md` antes de tocar la base de datos.

---

## 1. Qué es MuscleUp

Plataforma de operación de vending de suplementos. Cubre el ciclo:

> Compra → Recepción → Encartuchado → Planeación → Surtido → Operación en
> campo → Pesaje → Reconciliación → BI.

Roles: `direccion`, `compras`, `almacen`, `planeador`, `operador`, `admin`.

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (App Router), React Server Components, TypeScript |
| UI | Tailwind CSS + shadcn/ui (style `new-york`, base color `zinc`) |
| Backend | Supabase: Postgres 15+, Auth, Storage, Edge Functions, Realtime |
| Hosting | Vercel (web) + Supabase Cloud (BD) |
| Estado server | Server Components + Server Actions. Client components solo donde haya interactividad real. |

---

## 3. Estructura del repo

```
.
├── src/
│   ├── app/                    # App Router de Next.js
│   │   ├── (auth)/             # login, magic link
│   │   ├── (admin)/            # usuarios, catálogos, máquinas, rutas
│   │   ├── (compras)/          # OC, sugeridor
│   │   ├── (almacen)/          # recepción, lotes, encartuchado, inventario
│   │   ├── (planeacion)/       # calendario, surtido
│   │   ├── (campo)/            # PWA operador
│   │   ├── (direccion)/        # dashboards, reconciliación
│   │   ├── api/                # webhooks (Nayax), endpoints internos
│   │   └── layout.tsx
│   ├── components/
│   │   └── ui/                 # primitivos shadcn/ui
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts       # createBrowserClient (Client Components)
│   │   │   ├── server.ts       # createServerClient (RSC, Server Actions)
│   │   │   ├── middleware.ts   # refresh de sesión por request
│   │   │   └── database.types.ts  # generado con npm run db:types
│   │   └── utils.ts            # helper `cn` de Tailwind
│   └── middleware.ts           # invoca supabase/middleware en cada request
├── supabase/
│   ├── config.toml             # config del stack local de Supabase
│   ├── migrations/             # SQL versionado (numerado por timestamp)
│   ├── functions/              # Edge Functions (Deno)
│   └── seed/                   # datos semilla
├── docs/
│   └── muscleup_modelo_datos.md   # fuente única del modelo de datos (v2.0)
├── .env.example                # plantilla de variables; .env.local es local
├── components.json             # config shadcn/ui
├── CLAUDE.md                   # este archivo
└── README.md
```

---

## 4. Convenciones de base de datos

Resumen rápido — el detalle completo está en `docs/muscleup_modelo_datos.md`.

| Convención | Regla |
|---|---|
| IDs | `uuid` con `gen_random_uuid()`. `profiles.id` extiende `auth.users.id`. |
| Timestamps | `created_at timestamptz default now()` en toda tabla. `updated_at` con trigger en las que sufren updates. |
| Soft-delete en catálogos | `activo boolean default true`. No borrado físico. |
| Pesos | **Siempre en gramos enteros (`int`)**. Nunca decimales. |
| Montos | `numeric(14,2)` MXN. Costo por gramo `numeric(12,6)`. |
| Movimientos | Tablas append-only. Correcciones con asientos compensatorios. |
| Folios | Generados por secuencias (`OC-000123`, `REC-000045`, `ENC-000234`, etc.). |
| RLS | Habilitado en TODAS las tablas. Policies por rol vía `public.user_has_role()`. |
| Auditoría | Cambios sensibles → `audit_log` por trigger. |
| Nombres | `snake_case`. Plurales para tablas (`productos`), singular para campos. |
| FK | `on delete restrict` por default. `on delete cascade` solo en tablas hijas claras (ej. `oc_items` → `ordenes_compra`). |

### Triggers obligatorios al crear tablas

1. `updated_at` automático en tablas que lo lleven.
2. Inserción en `movimientos_inventario` desde `recepcion_items`, `encartuchado_lotes`, `surtido_items`, `llenado_items`, `ventas_maquina`, `pesaje_tolva_items`, `conteo_granel_items`, `conteo_cartuchos_items`.
3. Auditoría en `audit_log` para tablas críticas (catálogos, contratos, kardex).
4. Generación automática de `devoluciones_almacen` cuando `llenado_items.cartuchos_devolucion > 0`.

### Funciones críticas

- `public.user_has_role(role app_role) → boolean` — base de las RLS.
- `pick_lote_peps_granel(producto_id, gramos)` — PEPS para granel.
- `pick_batch_peps_cartucho(producto_id, cartuchos)` — PEPS para cartuchos.
- `calcular_sugerido_surtido(maquina_id)` — máx/mín para planeación.
- `cerrar_periodo(mes, anio)` — cierre contable mensual.

---

## 5. Flujo de trabajo con migraciones

**NUNCA** escribas SQL en el dashboard de Supabase para cambios de esquema. Todo cambio va por migración versionada.

```bash
# Crear una nueva migración (genera un archivo .sql con timestamp)
npm run db:new -- nombre_descriptivo
# → supabase/migrations/20260523182000_nombre_descriptivo.sql

# Aplicar al stack local (requiere Docker corriendo)
npm run db:reset            # ⚠️ destruye y recrea la BD local desde cero
npm run db:start            # arranca el stack local

# Diferenciales (qué cambió localmente que no está en migraciones)
npm run db:diff -- -f nombre_del_diff

# Enlazar al proyecto remoto
npm run db:link             # usa SUPABASE_PROJECT_REF del .env.local

# Subir migraciones al proyecto remoto
npm run db:push

# Regenerar tipos TypeScript desde el esquema actual
npm run db:types
```

### Orden de aplicación de migraciones (importante)

El modelo tiene 43 tablas. Respeta este orden al crear las migraciones (FK):

1. **Enums** (los 19 tipos enumerados al inicio).
2. **Catálogos sin FK**: `proveedores`, `clientes`, `productos`.
3. **Catálogos con FK**: `presentaciones_proveedor`, `ubicaciones`, `maquinas`, `tolvas`.
4. **Identidad**: `profiles`, `user_roles`, `audit_log`.
5. **Configuración**: `config_global`, `contratos_cliente`.
6. **Rutas**: `rutas`, `ruta_maquinas`, `asignaciones_diarias`, `asignacion_maquinas`.
7. **Compras**: `ordenes_compra`, `oc_items`.
8. **Recepción y lotes**: `recepciones`, `lotes`, `recepcion_items`.
9. **Encartuchado**: `encartuchados`, `encartuchado_lotes`.
10. **Surtido**: `surtidos`, `surtido_items`.
11. **Operación de campo**: `jornadas`, `check_ins`, `llenados`, `llenado_items`, `devoluciones_almacen`, `incidencias`.
12. **Cierre y conteos**: `cierres_mensuales`, `pesajes_maquina`, `pesaje_tolva_items`, `conteos_almacen`, `conteo_granel_items`, `conteo_cartuchos_items`.
13. **Kardex**: `movimientos_inventario`.
14. **Ventas Nayax**: `ventas_maquina`, `nayax_sync_log`.
15. **Calibración**: `calibraciones_maquina`.
16. **Reportes y alertas**: `reportes_cliente`, `alertas`.
17. **Triggers, funciones, RLS policies** (en migraciones separadas posteriores).
18. **Vistas materializadas** (BI) y seeds.

---

## 6. Convenciones de TypeScript / Next.js

- **Server Components por default.** Solo marca un componente como `"use client"` si necesita estado/efectos/eventos en el navegador.
- **Server Actions** para mutaciones (formularios). Validación con `zod`.
- **Cliente Supabase**:
  - En Client Components → `createClient` de `@/lib/supabase/client`.
  - En Server Components, Server Actions y Route Handlers → `createClient` de `@/lib/supabase/server`.
  - El refresh de sesión por cookie lo hace el middleware (`src/middleware.ts` → `src/lib/supabase/middleware.ts`).
- **No exportes** `SUPABASE_SERVICE_ROLE_KEY` al cliente. Solo en código del servidor.
- **Tipos generados**: `npm run db:types` reescribe `src/lib/supabase/database.types.ts`. No editar a mano.
- **Imports**: alias `@/` mapea a `src/`.

---

## 7. UI con shadcn/ui

- Config: `components.json` (style `new-york`, base color `zinc`, `cssVariables: true`).
- Para añadir un primitivo (corre en local con red abierta a `ui.shadcn.com`):
  ```bash
  npx shadcn@latest add button input label dialog table
  ```
- Helper `cn()` está en `src/lib/utils.ts`.
- Variables CSS de color están en `src/app/globals.css` (light + dark).

---

## 8. Storage (buckets sugeridos)

Crear en Supabase Dashboard → Storage cuando se llegue al módulo de campo:

- `evidencias-checkin/`
- `evidencias-llenado/`
- `evidencias-pesaje/`
- `evidencias-incidencias/`
- `evidencias-calibracion/`
- `reportes-cliente/`

Todos privados, acceso vía RLS + signed URLs.

---

## 9. Reglas para Claude Code (cómo trabajar en este repo)

1. **Antes de tocar SQL**, lee `docs/muscleup_modelo_datos.md`. No inventes campos ni cambies tipos sin pedir confirmación.
2. **No escribas migraciones aplicadas directo en remoto** sin que el humano lo apruebe. Crea el archivo en `supabase/migrations/`, muestra el SQL, y deja que el humano corra `npm run db:push`.
3. **Siempre RLS habilitado** al crear una tabla, con al menos una policy explícita (no dejes tablas sin policy: Supabase advierte y queda bloqueado para `anon`).
4. **No pongas lógica de negocio en triggers complejos sin discutir**. Triggers solo para: `updated_at`, `movimientos_inventario`, `audit_log`, `devoluciones_almacen` automáticas.
5. **Nada de `service_role` en el cliente**. Si necesitas bypass de RLS para un cron/job, usa una Edge Function.
6. **Idiomas**: nombres de tablas/columnas en español (`productos`, `gramos_iniciales`). UI en español MX. Código (variables, funciones) en español o inglés según legibilidad, pero consistente dentro del módulo.
7. **Commits**: en español, descriptivos, en presente. Ej. `feat(compras): agrega tabla ordenes_compra y oc_items`.
8. **No instales librerías sin necesidad**. Antes de añadir una dep, evalúa si Tailwind/shadcn/Server Actions ya lo resuelven.
9. **Pruebas manuales**: cuando termines un módulo, arranca `npm run dev` y verifica el flujo crítico. Si no puedes (entorno remoto), documéntalo en el PR.

---

## 10. Comandos útiles

```bash
# Dev
npm run dev                 # arranca Next en :3000
npm run typecheck           # tsc --noEmit
npm run lint                # next lint
npm run build               # build de prod

# Supabase
npm run db:start            # arranca stack local (requiere Docker)
npm run db:stop
npm run db:status
npm run db:link             # enlaza al proyecto remoto (SUPABASE_PROJECT_REF)
npm run db:new -- nombre    # crea migración vacía
npm run db:diff -- -f nombre  # diff a partir del stack local
npm run db:push             # sube migraciones a remoto
npm run db:reset            # reset stack local
npm run db:types            # regenera src/lib/supabase/database.types.ts
```

---

## 11. Variables de entorno

Ver `.env.example`. Resumen:

- `NEXT_PUBLIC_SUPABASE_URL` — pública, URL del proyecto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — pública, key con RLS.
- `SUPABASE_SERVICE_ROLE_KEY` — secreta, **nunca** al cliente. Para Edge Functions y scripts admin.
- `SUPABASE_PROJECT_REF` — para `supabase link`.
- `SUPABASE_DB_PASSWORD` — password del usuario `postgres` del proyecto, para `db:push`.
- `NEXT_PUBLIC_APP_URL` — URL base de la app (dev: `http://localhost:3000`).

---

## 12. Roadmap (referencia rápida)

Ver `docs/muscleup_modelo_datos.md` sección de orden de migraciones y el documento de diseño funcional. Resumen de fases:

| Fase | Entregable |
|---|---|
| 0 | Scaffold (este commit). |
| 1 | Esquema BD (migraciones por grupo) + RLS base. |
| 2 | Auth + layout por rol + catálogos. |
| 3 | Compras + Recepción + Lotes. |
| 4 | Encartuchado + Inventario. |
| 5 | Máquinas + Planograma. |
| 6 | Rutas + Planeación + Surtido. |
| 7 | PWA Operador (campo). |
| 8 | Pesaje + Cierre mensual. |
| 9 | Ingesta Nayax + Dashboards Dirección. |
| 10 | Hardening + alertas + exportes. |
