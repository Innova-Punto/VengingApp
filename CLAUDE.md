# CLAUDE.md — Convenciones del proyecto MuscleUp / VendingApp

> Documento operativo para agentes (Claude Code) trabajando en este repo.
> **Antes de tocar la base de datos**, lee `docs/muscleup_modelo_datos.md` (v3.0, auditado
> contra producción). Para entender qué hace cada pantalla, `docs/modulos_app.md`.
>
> Última actualización: 14-ago-2026.

---

## 1. Qué es MuscleUp

Plataforma de operación de vending de suplementos. Cubre el ciclo:

> Compra → Recepción → Encartuchado → Planeación → Surtido → Operación en campo
> → Pesaje → Cierre mensual → BI.

Roles (`app_role`): `direccion`, `compras`, `almacen`, `planeador`, `operador`, `admin`.

**La app está en producción** operando ~83 máquinas en 75 ubicaciones (Smart Fit,
Planet Fitness y Smart Energy), con 4 personas en campo. No es un proyecto en scaffold:
cualquier cambio afecta la operación diaria.

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (App Router), React Server Components, TypeScript |
| UI | Tailwind CSS + shadcn/ui (style `new-york`, base color `zinc`) |
| Mapas | Leaflet + react-leaflet + OpenStreetMap (sin API key) |
| Backend | Supabase: Postgres 15+, Auth, Storage, Realtime, pg_cron |
| Hosting | Vercel (web) + Supabase Cloud (BD) |
| Estado server | Server Components + Server Actions. Client components solo con interactividad real. |

---

## 3. Estructura del repo

```
.
├── src/
│   ├── app/
│   │   ├── (auth)/                  # login, set-password
│   │   ├── (authenticated)/         # app interna (layout con navegación por rol)
│   │   │   ├── admin/               # catálogos + dirección/BI
│   │   │   ├── compras/ordenes/     # OC (MXN y USD)
│   │   │   ├── almacen/             # inventario, recepciones, lotes, encartuchado,
│   │   │   │                        #   devoluciones, conteos
│   │   │   └── planeacion/          # salud-maquinas, asignaciones (+dinamica),
│   │   │                            #   emergencias, surtidos
│   │   ├── campo/                   # PWA del operador (móvil)
│   │   ├── api/                     # webhooks e internos
│   │   └── auth/callback/
│   ├── components/ui/               # primitivos shadcn/ui
│   └── lib/
│       ├── supabase/                # client.ts, server.ts, admin.ts, middleware.ts,
│       │                            #   database.types.ts (generado)
│       ├── auth.ts                  # requireRole()
│       ├── datetime.ts              # helpers CDMX
│       ├── salud-maquinas.ts        # señal de máquina muda (umbral 12 h)
│       ├── maquinas-visita.ts, incidencias-catalogo.ts, errores-operativos.ts
│       ├── storage-upload.ts        # subida cliente→Storage con reintentos
│       ├── image-compress.ts        # compresión antes de subir
│       ├── nayax/                   # ingesta y mapeo
│       └── cierre-reporte/
├── supabase/migrations/             # 129 migraciones versionadas
├── docs/
│   ├── muscleup_modelo_datos.md     # ← modelo de datos real (v3.0)
│   └── modulos_app.md               # ← mapa funcional por módulo
└── CLAUDE.md
```

---

## 4. Convenciones de base de datos

Detalle completo en `docs/muscleup_modelo_datos.md`. Resumen operativo:

| Convención | Regla |
|---|---|
| IDs | `uuid` / `gen_random_uuid()`. `profiles.id` extiende `auth.users.id`. |
| Timestamps | `created_at timestamptz default now()`; `updated_at` con trigger `set_updated_at`. |
| Soft-delete | `activo boolean default true`. Nunca borrado físico. |
| Pesos | **Gramos enteros (`int`)**. Nunca decimales. |
| Montos | `numeric(14,2)` MXN; costo por gramo `numeric(12,6)`. |
| Costos | **Siempre sin IVA.** Ojo con el doble descuento de IVA al capturar (ya nos pasó). |
| Movimientos | `movimientos_inventario` append-only; correcciones con asientos compensatorios. |
| Folios | Secuencias: `OC-`, `REC-`, `ENC-`, `SUR-`, `INC-`, `SRV-`, `VIC-`. |
| RLS | Habilitado en las **63** tablas, con policies por rol vía `public.user_has_role()`. |
| Zona horaria | Nayax = UTC; negocio = CDMX. Cortes con `at time zone 'America/Mexico_City'`. |
| Nombres | `snake_case` en español. Plural en tablas, singular en campos. |
| FK | `on delete restrict` por default; `cascade` solo en hijas claras (`oc_items`). |

### Reglas que se aprendieron a la mala

1. **Nunca crear un overload de una función existente** sin dropear la anterior: PostgREST
   resuelve por parámetros nombrados y puede pegarle a la firma vieja (nos pasó con
   `abrir_cierre_mensual` y hoy sigue vivo con `op_registrar_llenado`).
2. **El signo del kardex**: `venta_salida_tolva` es negativo (salida) desde ago-2026, histórico
   incluido. Usar `ABS()` en consultas de consumo sigue siendo la opción segura.
3. **Toda migración debe llevar su DDL en el archivo.** Hubo migraciones que decían "cuerpo
   aplicado en el remoto" y rompían la reconstrucción; ya se corrigieron. Antes de dar por
   terminada una migración, comprueba que corre en una base limpia.
   Ojo: `create or replace view` falla si cambian las columnas, y `create or replace function`
   falla si cambia el tipo de retorno — en esos casos hay que dropear primero.
4. **Consumo real solo es auditable entre dos pesajes físicos.** No inferir consumo del kardex
   sin baseline.
5. **Las máquinas `tipo = 'servicio'` no venden.** Excluirlas de cualquier reporte o alerta
   basada en venta, o generan falsas alarmas permanentes.

---

## 5. Flujo de trabajo con migraciones

**NUNCA** escribas SQL en el dashboard de Supabase para cambios de esquema. Todo cambio va por
migración versionada en `supabase/migrations/`.

```bash
npm run db:new -- nombre_descriptivo   # crea la migración con timestamp
npm run db:reset                       # ⚠️ recrea la BD local (requiere Docker)
npm run db:diff -- -f nombre           # diff del stack local
npm run db:link                        # enlaza al proyecto remoto
npm run db:push                        # sube migraciones al remoto
npm run db:types                       # regenera database.types.ts
```

**Regla de oro para aplicar en producción**: crea el archivo de migración, muestra el SQL y
**pide aprobación explícita** antes de aplicarlo. Si dirección aprueba, se puede aplicar por
MCP o `db:push`, pero el archivo de migración **siempre** debe existir y quedar commiteado,
y hay que registrar la versión en `supabase_migrations.schema_migrations`.

Al agregar tablas: RLS habilitado + al menos una policy explícita + trigger de `updated_at`
si aplica + asiento en `movimientos_inventario` si toca inventario.

---

## 6. Convenciones de TypeScript / Next.js

- **Server Components por default.** `"use client"` solo con estado/efectos/eventos.
- **Server Actions** para mutaciones, con `requireRole(...)` como primera línea.
- **Cliente Supabase**:
  - Client Components → `createClient` de `@/lib/supabase/client`
  - Server Components / Actions / Route Handlers → `@/lib/supabase/server`
  - Jobs que necesiten bypass de RLS → `@/lib/supabase/admin` (nunca en el cliente)
- **Nunca** exponer `SUPABASE_SERVICE_ROLE_KEY` al cliente.
- **Tipos generados**: `npm run db:types` reescribe `src/lib/supabase/database.types.ts`.
  No editar a mano; regenerar tras cada migración.
- **Imports**: alias `@/` → `src/`.
- **Subida de archivos desde campo**: usar `storage-upload.ts` (cliente → Storage con
  reintentos) + `image-compress.ts`. No mandar imágenes por Server Action: la señal débil
  del operador tumba la función serverless.
- Antes de terminar: `npm run typecheck && npm run lint && npm run build`.

---

## 7. Storage

7 buckets (ver `docs/muscleup_modelo_datos.md` §8). Todos privados salvo `manuales-operador`.
Acceso a privados **solo por signed URL** (1 h) generada en servidor.

---

## 8. Reglas para Claude Code (cómo trabajar en este repo)

1. **Antes de tocar SQL**, lee `docs/muscleup_modelo_datos.md`. No inventes campos ni cambies
   tipos sin confirmar.
2. **Producción es producción.** Cambios de datos o esquema en remoto requieren aprobación
   explícita del humano en el mensaje. Al hacer correcciones de datos, envuelve en transacción,
   deja rastro en `audit_log` y reporta el impacto (qué tablas, cuántas filas, efecto en cierres).
3. **RLS siempre habilitado** al crear tablas, con policy explícita.
4. **Triggers solo para**: `updated_at`, `movimientos_inventario`, `audit_log`, devoluciones
   automáticas, folios y validaciones simples. Lógica de negocio compleja → RPC `security definer`.
5. **Nada de `service_role` en el cliente.**
6. **Idiomas**: tablas/columnas y UI en español MX. Código consistente dentro del módulo.
7. **Commits**: en español, descriptivos, en presente.
   Ej. `feat(compras): agrega OC en USD con tipo de cambio confirmable`.
8. **PRs**: describe el cambio funcional, la migración incluida y cómo probar. Si el humano
   pidió revisión previa, **no mergear** ni aplicar la migración.
9. **No instales librerías sin necesidad.**
10. **Al terminar un módulo**, corre `typecheck`, `lint` y `build`. Si no puedes probar el flujo
    en vivo (entorno remoto), dilo explícitamente en el PR.
11. **Los análisis de negocio se hacen contra datos reales**, no estimados. Si un número no
    cuadra, dilo y explica la causa antes de entregar el reporte.

---

## 9. Comandos útiles

```bash
# Dev
npm run dev            # Next en :3000
npm run typecheck      # tsc --noEmit
npm run lint           # next lint
npm run build          # build de producción

# Supabase
npm run db:start / db:stop / db:status
npm run db:new -- nombre
npm run db:diff -- -f nombre
npm run db:push
npm run db:reset
npm run db:types
```

---

## 10. Estado de módulos (ago-2026)

| Módulo | Estado |
|---|---|
| Auth, roles y layout por rol | ✅ producción |
| Catálogos (productos, proveedores, clientes, máquinas, rutas) | ✅ producción |
| Planogramas y recetas | ✅ producción |
| Compras — OC en MXN | ✅ producción |
| Compras — **OC en USD con TC confirmable** | ✅ producción (ago-2026) |
| Recepciones, lotes, encartuchado, devoluciones, conteos | ✅ producción |
| Planeación, surtido y emergencias | ✅ producción |
| **Ruteo dinámico** (score + asignación por paradas + mapa vivo) | ✅ producción (ago-2026) |
| PWA operador (check-in, pesaje, llenado, checkout, incidencias) | ✅ producción |
| **Máquinas de servicio Smart Energy** (checklist + firma) | ✅ producción (ago-2026) |
| Pesaje y cierre mensual encadenado con IVA | ✅ producción |
| Ingesta Nayax + dashboards + supervisión + health checks | ✅ producción |
| Ventas intercompany | ✅ producción |
| Reportes a cliente (`reportes_cliente`) | ⚠️ tabla creada, sin flujo en UI |
| Calibraciones (`calibraciones_maquina`) | ⚠️ tabla creada, sin flujo en UI |
| Contratos de cliente y `config_global` | ⚠️ tablas vacías; parámetros hoy en código |

**Deuda técnica** (detalle en `docs/muscleup_modelo_datos.md` §10). Resueltos en ago-2026:
overloads de `op_registrar_llenado`, migraciones sin DDL y el signo del kardex.
Pendientes: `costo_polvo`/`costo_vaso` en cero y `ventas_maquina.cliente_id` nulo.
