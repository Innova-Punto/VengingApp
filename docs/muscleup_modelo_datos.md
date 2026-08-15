# Modelo de datos — MuscleUp / VendingApp

**v3.0 · Auditado contra producción (Supabase `opncevovlgcblwlztqck`) el 14-ago-2026.**

Este documento describe **lo que existe hoy**, no un diseño teórico. Toda tabla, enum,
función y bucket aquí listado fue verificado en la base de datos productiva.

| Concepto | Estado actual |
|---|---|
| Tablas en `public` | **64** (todas con RLS habilitado y al menos 1 policy) |
| Enums | 24 |
| Funciones | ~74 (25 de trigger, ~49 RPC/utilitarias) |
| Vistas | 4 |
| Migraciones versionadas | 127 |
| Buckets de Storage | 7 (6 privados + `manuales-operador` público) |
| Cron jobs (pg_cron) | 4 |

Volumen operativo (14-ago-2026): 83 máquinas · 75 ubicaciones · 6 clientes · 31 productos ·
11 rutas · 23,020 ventas Nayax · 57,038 movimientos de kardex · 2 cierres mensuales.

---

## 1. Convenciones vigentes

| Convención | Regla |
|---|---|
| IDs | `uuid` con `gen_random_uuid()`. `profiles.id` extiende `auth.users.id`. |
| Timestamps | `created_at timestamptz default now()`. `updated_at` vía trigger `set_updated_at` (23 tablas). |
| Soft-delete | `activo boolean default true` en catálogos. Nunca borrado físico. |
| Pesos | **Gramos enteros (`int`)**. Nunca decimales. |
| Montos | `numeric(14,2)` MXN. Costo por gramo `numeric(12,6)`. |
| Precios | **Se registran SIN IVA para costo; la venta guarda bruto, IVA y neto por separado.** |
| Movimientos | `movimientos_inventario` es append-only. Correcciones = asientos compensatorios. |
| Folios | Secuencias: `OC-`, `REC-`, `ENC-`, `SUR-`, `INC-`, `SRV-`, `VIC-`. |
| RLS | Habilitado en las 64 tablas. Policies por rol vía `public.user_has_role()`. |
| Zona horaria | Nayax entrega **UTC**; la operación es **CDMX (UTC−6)**. Los cortes de día/mes se calculan `at time zone 'America/Mexico_City'`. |
| Nombres | `snake_case`, español. Plural para tablas, singular para campos. |

### Roles (`app_role`)
`direccion`, `compras`, `almacen`, `planeador`, `operador`, `admin`.

---

## 2. Catálogos base

### `productos` (31)
`id, sku, nombre, tipo(producto_tipo), marca, sabor, categoria, cliente_exclusivo_id,
gramaje_cartucho_default, gramaje_servicio_default, precio_venta_default, unidad_medida,
notas, activo, stock_minimo, stock_maximo, punto_reorden, nayax_product_ids[],
capacidad_g_por_tolva, requiere_encartuchado`

- `tipo`: `polvo` | `vaso`.
- `cliente_exclusivo_id`: producto exclusivo de un cliente (ej. línea Planet Fitness).
- `requiere_encartuchado = false` → el polvo se surte a granel sin pasar por cartucho.
- `nayax_product_ids[]`: PA codes asociados; un trigger valida que no se repitan entre productos.

### `proveedores` (11) · `presentaciones_proveedor` (55)
La presentación es la **unidad comprable** (ej. "1 KG", "Caja 12 pzas") y define
`peso_neto_gramos`, `unidades_por_presentacion`, `costo_unitario`, `moneda` e `iva_tasa`.
Las OC referencian presentaciones, no productos.

### `clientes` (6) · `ubicaciones` (75)
- `clientes.es_intercompany`: marca empresas del grupo (destino de ventas intercompany).
- `ubicaciones` guarda `lat`, `lng`, `radio_geofence_m` y **`horario_apertura`/`horario_cierre`**
  — estos horarios alimentan el cálculo de "horas sin venta **en operación**".

### `maquinas` (83) · `tolvas` (664)
`maquinas`: `serie, alias, ubicacion_id, modelo, num_tolvas, capacidad_max_tolva_g,
nayax_machine_id, nayax_serial, frecuencia_visita_dias, qr_codigo, estado(maquina_estado),
vaso_producto_id, vaso_capacidad_max, vaso_inventario_actual, **tipo**, **requiere_pesaje**,
**ultima_visita_at**`

- **`tipo`** (text con CHECK): `polvo_directo` | `preparado` | **`servicio`**.
  - `polvo_directo`: dispensa el polvo de la tolva (mayoría Smart Fit).
  - `preparado`: bebida por receta con varios ingredientes (Planet Fitness).
  - `servicio`: **Smart Energy** — sin venta Nayax ni inventario propio; solo checklist de mantenimiento.
- `requiere_pesaje`: obliga a pesar tolvas en cada visita.
- `ultima_visita_at`: lo actualiza el trigger `fn_maquinas_ultima_visita` al cerrar check-in.
  Es la base de la señal "visita vencida" del ruteo dinámico.

`tolvas`: inventario vivo por tolva — `producto_id, gramaje_servicio, precio_venta,
nayax_item_code, capacidad_max_g, capacidad_max_g_override, inventario_actual_g,
costo_promedio_g_actual, ultimo_llenado_at, ultimo_pesaje_at`.
Las tolvas se crean automáticamente al alta de máquina (`create_tolvas_for_maquina`).

### `planogramas` (2) + `planograma_items` · `planograma_historico` (657)
Plantillas de configuración de tolvas aplicables a varias máquinas. Cada cambio de
producto/gramaje/precio en una tolva queda versionado en `planograma_historico`
(`vigente_desde` / `vigente_hasta`) vía `log_planograma_cambio`.

### `recetas` (2) + `receta_items` + `receta_item_ingredientes`
Plantilla de bebidas compuestas: un item de venta Nayax (`nayax_item_code`) consume
**varios ingredientes** con sus gramos. Se materializa por máquina en
`maquina_items` (111) + `maquina_item_ingredientes` (286).
Al vender un preparado, la venta se descompone en `venta_ingredientes` (27,512 filas).

### `rutas` (11) + `ruta_maquinas` (83)
Zona geográfica-operativa con `operador_titular_id` y `color_hex`.
`ruta_maquinas` es 1 máquina → 1 ruta (unique en `maquina_id`), con `orden` de visita.

### Identidad: `profiles` (8) · `user_roles` (28) · `audit_log` (859)
`handle_new_auth_user` crea el perfil al registrarse. Un usuario puede tener varios roles.

---

## 3. Compras

### `ordenes_compra` (25) + `oc_items` (78)
`ordenes_compra`: `folio, proveedor_id, fecha_emision, fecha_esperada, estado(oc_estado),
subtotal, iva, total, **moneda**, **tipo_cambio**, **tc_confirmado**, motivo_cierre`

**Compra en divisa (USD)** — agregado ago-2026:
- Si `moneda <> 'MXN'`, los items se capturan en la divisa (`oc_items.costo_unitario_divisa`)
  y el MXN se **calcula** = divisa × `tipo_cambio`. Nadie teclea MXN.
- `tipo_cambio` nace provisional y se confirma con el TC real ponderado de los depósitos
  (el proveedor cobra 50% anticipo + 50% liquidación, con TC distinto).
- **Candado**: el trigger `validar_tc_en_recepcion` **impide crear una recepción** si la OC
  está en divisa con `tc_confirmado = false`. Así ningún lote nace con costo provisional.
- El TC se congela con la primera recepción.

`recalcular_total_oc` (trigger) recalcula `subtotal`/`iva`/`total` ante cualquier cambio de items.

---

## 4. Almacén

### `recepciones` (22) + `recepcion_items` (73) → `lotes` (73)
El trigger `handle_recepcion_item` crea el **lote** con su `costo_por_gramo`, actualiza
`oc_items.recibido`, mueve el estado de la OC (`parcial` → `recibida`) y registra el
movimiento `recepcion` en el kardex.

`lotes`: `codigo_lote, producto_id, proveedor_id, presentacion_id, recepcion_id,
fecha_recepcion, fecha_caducidad, gramos_iniciales, gramos_disponibles_granel,
costo_por_gramo, unidades_iniciales, unidades_disponibles`
(los productos tipo `vaso` usan las columnas de unidades).

### `encartuchados` (235) + `encartuchado_lotes` (264)
Convierte granel → cartuchos. `handle_encartuchado_lote` descuenta el granel por **PEPS**,
calcula el `costo_promedio_g` ponderado del batch y registra la merma.
`cantidad_disponible` es el stock vivo de cartuchos.

### Inventario y costeo
- **PEPS**: `pick_lote_peps_granel`, `pick_batch_peps_cartucho`, `pick_lote_peps_vaso`.
- Vista **`v_inventario_producto`**: posición consolidada por producto.
- `snapshot_inventario_desglosado` / `snapshot_inventario_por_producto`: fotos para cierre.

### Conteos físicos
`conteos_almacen` (2) + `conteo_granel_items` (60) + `conteo_cartuchos_items` (39) +
`conteo_vasos_items` (6). Se aplican con `aplicar_conteo_almacen`, que genera los
ajustes `ajuste_conteo_almacen` en el kardex.

### `devoluciones_almacen` (107)
Se generan **automáticamente** cuando el operador carga menos cartuchos de los surtidos.
`recibir_devolucion` concilia lo que regresa físicamente; si hay diferencia, levanta incidencia.

---

## 5. Planeación y surtido

### `asignaciones_diarias` (222) + `asignacion_maquinas` (1,710)
Una asignación = un operador + una ruta + una fecha (unique ruta/fecha).
`estado(asignacion_estado)`: `planeada → surtida → en_jornada → completada` (+ `cancelada`,
`completada_parcialmente`). `es_emergencia = true` para rutas fuera de calendario (sin ruta base).

**`asignacion_maquinas.origen`** (CHECK): `base_ruta` | `agregada_excepcion` | **`sugerencia_dinamica`**.
Ese tag es el KPI para comparar ruteo dinámico vs. estático.

### `surtidos` (212) + `surtido_items` (6,144)
Lo que almacén entrega al operador. `cartuchos_sugeridos` lo calcula el sugeridor;
`cartuchos_entregados` es lo real. Al completar el surtido se descuenta inventario por PEPS
(idempotente) y la asignación pasa a `surtida`. `cancelar_ruta_surtida` reintegra al almacén.

### Ruteo dinámico (ago-2026)
**`sugerencia_ruteo_diaria()`** — el sistema propone, planeación dispone. Devuelve por máquina
activa/operativa su prioridad y un motivo legible:

| Prioridad | Señal | Regla |
|---|---|---|
| 1 | **Revisión** (máquina muda) | ≥12 h sin venta **en horario de operación**. Excluye `tipo = 'servicio'`. |
| 2 | Crítica | días para vaciarse ≤3, o hueco ≥3 cartuchos, o tolva casi vacía (<3 gramajes) |
| 3 | Alta | días <5, o ≥4 tolvas cortas, o hueco ≥2 cartuchos |
| 4 | Visita vencida | `ultima_visita_at` > `frecuencia_visita_dias` (o nunca visitada) |
| 5-6 | Media / Baja | 2-3 tolvas cortas / 1 tolva corta |
| 7 | Relleno | resto, por proximidad a necesitar visita |

- "Tolva corta" = espacio libre ≥ 1 cartucho (`gramaje_cartucho_default`, 400 g default).
- Días para vaciarse = `inventario_actual_g ÷ consumo diario 14 d` del kardex
  (usar **ABS** en `venta_salida_tolva` por el bug de signo).
- La UI agrupa por **parada (ubicación)**: donde hay máquina nutri + Smart Energy, ambas
  viajan en el mismo viaje y la parada hereda la mejor prioridad de sus máquinas.

---

## 6. Operación en campo (PWA)

### `jornadas` (204) → `check_ins` (1,542) → `llenados` (986) + `llenado_items` (1,483)
- `op_iniciar_jornada` abre la jornada (acepta asignaciones `planeada` o `surtida`).
- `op_check_in` registra entrada con GPS/QR/manual y foto.
- **Checkout obligatorio**: toda visita cierra con 3 preguntas sí/no
  (`checkout_nayax_ok`, `checkout_maquina_limpia`, `checkout_productos_ok`) + foto opcional.
- `op_registrar_llenado` carga tolvas, actualiza costo promedio ponderado, genera devoluciones
  automáticas y cierra el check-in. `op_cerrar_check_in_sin_llenado` para visitas de inspección.
- `cerrar_jornadas_pendientes_fin_de_dia` (cron 06:05 UTC) cierra lo que quedó abierto y
  levanta la alerta `checkin_sin_llenado` — distinguiendo máquinas de servicio.

### Máquinas de servicio — Smart Energy (ago-2026)
`checklist_plantillas` (1) + `checklist_items` (31) → `servicio_visitas` (46) + `servicio_respuestas` (1,426)

- Checklist versionado por secciones (Limpieza, Equipo, Biométrico, Mueble, Producto,
  Prueba de funcionamiento). Cada respuesta: `bien` | `mal` | `na`, con descripción y foto
  obligatorias cuando es `mal`.
- `servicio_visitas` es 1:1 con el check-in, folio `SRV-`, e incluye inventario S/F,
  reposición de producto, foto general y **firma del líder del sitio** (o motivo de no-firma).
- `op_registrar_servicio` valida el checklist completo, inserta visita + respuestas y cierra
  el check-in de forma atómica.
- Estas máquinas están **excluidas** de `reporte_ventas_maquinas` y de la alerta de venta.

### `incidencias` (22) · `errores_operativos` (0)
- `incidencias`: reportes del operador en campo, con folio `INC-`, severidad y flujo de
  autorización de merma (`autorizar_merma_incidencia`).
- `errores_operativos`: fallas de proceso atribuibles a la operación
  (omisión de carga, llegada tarde, no registro de visita…), levantadas por supervisión.

---

## 7. Cierre mensual y BI

### `cierres_mensuales` (2) + `cierre_snapshot_producto` (113)
Modelo **encadenado por ventana**: el periodo va de `fecha_inicio_cierre` a `fecha_cierre`,
y el inventario **inicial de un mes = final del anterior** (no se re-mide).

- `abrir_cierre_mensual(mes, anio)` / `cerrar_cierre_mensual(cierre_id, force)`.
- `cierre_snapshot_producto` guarda por producto y momento (`inicio`/`fin`) los gramos y
  valores de almacén (granel/cartuchos/vasos) y de máquinas.
- Vista **`vista_reporte_cierre`**: consumo teórico vs. real, faltantes/sobrantes de pesaje.
- **COGS = inventario inicial + compras de la ventana − inventario final.**

### `pesajes_maquina` (214) + `pesaje_tolva_items` (1,694)
Pesaje físico de tolvas en campo (y conteo de vasos). Es la única fuente auditable del
consumo real; la desviación se valúa contra `tolvas.costo_promedio_g_actual`.
Editables por dirección con `editar_pesaje_tolva_item` / `editar_pesaje_vasos` (deja rastro).

### IVA (regla contable vigente)
Todos los productos causan **16%**. El ingreso se reconoce **sin IVA** (el IVA es pasivo SAT):
`ventas_maquina` guarda `precio_bruto` (público, con IVA), `iva` y `precio_sin_iva`.
La comisión Nayax se cobra sobre el precio **con** IVA.
Cascada estándar en todos los dashboards:
**Venta pública → IVA → Venta sin IVA → − comisión → − costo → utilidad.**

### `ventas_maquina` (23,020) + `venta_ingredientes` (27,512)
Ingesta desde Nayax vía `procesar_venta_nayax` (idempotente por `nayax_transaction_id`).
Mapea máquina + PA code → tolva/producto, descuenta inventario y registra el kardex.
Las bebidas preparadas se descomponen por ingrediente.

### `ventas_intercompany` (9)
Venta de inventario a empresas del grupo con folio `VIC-`, costo snapshot y margen
(`preview_costo_intercompany`, `registrar_venta_intercompany`).

### `movimientos_inventario` (57,038) — el kardex
Append-only. Toda la cadena pasa por aquí: `recepcion`, `encartuchado_*`, `surtido_salida_cartucho`,
`devolucion_entrada_*`, `llenado_*`, `venta_salida_tolva`, `merma_*`, `ajuste_*`, `venta_intercompany`.

### Alertas y salud
`alertas` (2,705), `health_check_runs` (61), vista `v_health_checks`, `v_capital_trabajo`.
Detectores en cron: `detectar_maquinas_sin_venta(12)` cada hora,
`detectar_surtidos_duplicados(7)` cada hora.

---

## 8. Storage

| Bucket | Acceso | Uso |
|---|---|---|
| `evidencias-checkin` | privado | fotos de entrada/salida de visita |
| `evidencias-llenado` | privado | evidencia de carga de tolvas |
| `evidencias-incidencias` | privado | fotos de incidencias |
| `evidencias-jornada` | privado | evidencia de inicio/fin de jornada |
| `evidencias-servicio` | privado | checklist Smart Energy: fallas, foto general, **firma** |
| `reportes-cierre` | privado | PDF/CSV de cierre y reportes a cliente |
| `manuales-operador` | **público** | material de apoyo de la PWA |

Acceso a privados siempre por **signed URL** (1 h) generada en servidor.
`cleanup_evidencias_viejas` (cron 03:00) purga evidencias antiguas.

---

## 9. Cron jobs

| Job | Horario | Función |
|---|---|---|
| `detectar-maquinas-sin-venta` | `0 * * * *` | `detectar_maquinas_sin_venta(12)` |
| `detectar-surtidos-duplicados` | `15 * * * *` | `detectar_surtidos_duplicados(7)` |
| `cleanup-evidencias-diario` | `0 3 * * *` | `cleanup_evidencias_viejas()` |
| `cerrar_jornadas_pendientes_fin_de_dia` | `5 6 * * *` | cierre de jornadas abiertas |

---

## 10. Deuda técnica conocida

1. **Overloads de `op_registrar_llenado`**: conviven 3 firmas (4, 5 y 9 parámetros). La app
   llama la de 9. Riesgo: una llamada con parámetros nombrados incompletos puede resolver a
   una firma vieja. **Pendiente: dropear las dos antiguas.**
2. **Signo en el kardex**: `venta_salida_tolva` y `venta_intercompany` guardan gramos
   positivos. Regla: para consumo real usar `ventas_maquina.gramos_dispensados` o `ABS()`.
3. **`ventas_maquina.cliente_id` es NULL**: identificar cliente vía
   `maquinas → ubicaciones → clientes`.
4. **`costo_polvo` / `costo_vaso` en ventas están en cero**: valuar con
   `tolvas.costo_promedio_g_actual`.
5. **Migraciones stub**: varias migraciones de cierre/IVA dicen "cuerpo aplicado en el remoto"
   y no contienen DDL. Un `db:reset` desde cero **no reproduce** el esquema productivo.
6. **`config_global` y `contratos_cliente` están vacías**: los parámetros viven hoy en código.

---

## 11. Cómo verificar este documento

```sql
-- Tablas + RLS
select relname, relrowsecurity from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' order by 1;

-- Funciones
select proname, prosecdef, pg_get_function_identity_arguments(oid)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' order by 1;

-- Crons y buckets
select jobname, schedule, command from cron.job;
select id, public from storage.buckets;
```
