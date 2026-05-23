# MuscleUp — Modelo de Datos Detallado

> **Documento técnico de referencia** para la construcción de la plataforma de operación de vending de suplementos.
> Versión 2.0 — Consolida todas las decisiones tomadas en los Bloques 1-4 del diseño funcional.

---

## Índice

1. [Convenciones globales](#convenciones-globales)
2. [Grupo 1 — Identidad y seguridad](#grupo-1--identidad-y-seguridad)
3. [Grupo 2 — Catálogos maestros](#grupo-2--catálogos-maestros)
4. [Grupo 3 — Configuración y contratos](#grupo-3--configuración-y-contratos)
5. [Grupo 4 — Máquinas y planograma](#grupo-4--máquinas-y-planograma)
6. [Grupo 5 — Rutas y operadores](#grupo-5--rutas-y-operadores)
7. [Grupo 6 — Compras](#grupo-6--compras)
8. [Grupo 7 — Recepción y lotes](#grupo-7--recepción-y-lotes)
9. [Grupo 8 — Encartuchado](#grupo-8--encartuchado)
10. [Grupo 9 — Surtido](#grupo-9--surtido)
11. [Grupo 10 — Operación de campo](#grupo-10--operación-de-campo)
12. [Grupo 11 — Cierre mensual y conteos](#grupo-11--cierre-mensual-y-conteos)
13. [Grupo 12 — Kardex (movimientos)](#grupo-12--kardex-movimientos)
14. [Grupo 13 — Ventas Nayax](#grupo-13--ventas-nayax)
15. [Grupo 14 — Calibración de máquinas](#grupo-14--calibración-de-máquinas)
16. [Grupo 15 — Reportes y alertas](#grupo-15--reportes-y-alertas)
17. [Tipos enumerados (ENUMs)](#tipos-enumerados-enums)
18. [Resumen de relaciones clave](#resumen-de-relaciones-clave)

---

## Convenciones globales

Estas reglas aplican a todas las tablas del sistema:

| Convención | Detalle |
|---|---|
| **IDs** | `uuid` con default `gen_random_uuid()`, salvo `profiles.id` que extiende `auth.users.id`. |
| **Timestamps** | Toda tabla lleva `created_at timestamptz default now()`. Las que sufren updates llevan `updated_at` con trigger automático. |
| **Soft-delete** | Catálogos llevan `activo boolean default true` en lugar de borrado físico. |
| **Pesos** | Siempre en **gramos enteros** (`int`). Nunca decimales. |
| **Montos** | `numeric(14,2)` MXN. |
| **Costos unitarios finos** | `numeric(12,6)` para precisión en costo por gramo. |
| **Tablas de movimientos** | Append-only. No se actualizan ni borran; correcciones se hacen con asientos compensatorios. |
| **Folios** | Generados automáticamente con secuencias Postgres (ej. `OC-000001`, `REC-000001`). |
| **RLS** | Habilitado en todas las tablas. Policies por rol definidas más adelante. |
| **Auditoría** | Cambios sensibles registrados en `audit_log` vía triggers. |
| **Convención de nombres** | `snake_case` en tablas y columnas. Plurales para tablas (`productos`), singulares para campos. |
| **FK obligatorias** | Por default `on delete restrict` para proteger histórico. `on delete cascade` solo en tablas hijas claras (ej. `oc_items` → `ordenes_compra`). |

---

## Grupo 1 — Identidad y seguridad

Tablas que manejan usuarios, roles y auditoría general del sistema.

### 1.1 `profiles`

**Propósito**: Extiende la tabla `auth.users` de Supabase con información de perfil del usuario interno (empleados de MuscleUp). Un usuario en `auth.users` se mapea 1:1 con un registro aquí.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users(id)` ON DELETE CASCADE | ID del usuario; mismo valor que en `auth.users`. |
| `full_name` | `text` | NOT NULL | Nombre completo del empleado. |
| `phone` | `text` | NULL | Teléfono celular, útil para notificaciones a operadores. |
| `email` | `text` | NULL | Email del empleado (puede diferir del email de auth si se desea). |
| `activo` | `boolean` | NOT NULL DEFAULT true | Si el empleado está activo en la organización. Al desactivar pierde acceso. |
| `created_at` | `timestamptz` | DEFAULT now() | Fecha de alta. |
| `updated_at` | `timestamptz` | DEFAULT now() | Actualizado vía trigger en cada modificación. |

**Notas operativas**: Cuando se da de baja un empleado, se desactiva (`activo = false`) pero no se borra para mantener trazabilidad de movimientos históricos firmados por él.

---

### 1.2 `user_roles`

**Propósito**: Asignación de roles a usuarios. Un usuario puede tener múltiples roles (ej. el dueño puede ser `admin` y `direccion` simultáneamente).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `user_id` | `uuid` | PK (parcial), FK → `profiles(id)` ON DELETE CASCADE | Usuario al que se asigna el rol. |
| `role` | `app_role` (enum) | PK (parcial), NOT NULL | Rol asignado. Valores: `direccion`, `compras`, `almacen`, `planeador`, `operador`, `admin`. |
| `created_at` | `timestamptz` | DEFAULT now() | Cuándo se otorgó el rol. |
| `created_by` | `uuid` | FK → `profiles(id)` | Quién otorgó el rol. |

**Clave primaria**: Compuesta `(user_id, role)`.

**Notas operativas**: Las policies de RLS consultan esta tabla mediante una función helper `auth.user_has_role(check_role)` que retorna `boolean`.

---

### 1.3 `audit_log`

**Propósito**: Bitácora de cambios sensibles en el sistema. Se alimenta automáticamente por triggers en tablas críticas (catálogos, contratos, configuración, movimientos de inventario).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | Identificador único del evento de auditoría. |
| `tabla` | `text` | NOT NULL | Nombre de la tabla afectada. |
| `registro_id` | `uuid` | NOT NULL | ID del registro afectado en esa tabla. |
| `accion` | `text` | NOT NULL CHECK (accion IN ('insert','update','delete')) | Tipo de operación. |
| `user_id` | `uuid` | FK → `profiles(id)` | Usuario que ejecutó la acción (puede ser NULL para procesos automáticos). |
| `diff_jsonb` | `jsonb` | NULL | Diferencia entre valor anterior y nuevo. En INSERT contiene solo el nuevo; en DELETE solo el anterior; en UPDATE ambos. |
| `fecha` | `timestamptz` | DEFAULT now() | Cuándo ocurrió el cambio. |
| `ip_address` | `inet` | NULL | IP de origen, si está disponible. |
| `user_agent` | `text` | NULL | User agent del navegador/cliente. |

**Índices recomendados**: `(tabla, registro_id)`, `(user_id, fecha desc)`, `(fecha desc)`.

**Notas operativas**: Esta tabla crece sin parar. Plan de retención: archivar a almacenamiento frío después de 24 meses. No se puede borrar para fines fiscales/auditoría.

---

## Grupo 2 — Catálogos maestros

Catálogos de proveedores, productos, clientes y ubicaciones.

### 2.1 `proveedores`

**Propósito**: Catálogo de proveedores de polvos y vasos (Isopure, Optimum Nutrition, fabricantes de vasos, etc.).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | Identificador único. |
| `nombre` | `text` | NOT NULL UNIQUE | Nombre comercial del proveedor (ej. "Isopure México"). |
| `rfc` | `text` | NULL | RFC para facturación. |
| `razon_social` | `text` | NULL | Razón social fiscal completa. |
| `contacto_nombre` | `text` | NULL | Nombre del contacto principal. |
| `contacto_email` | `text` | NULL | Email del contacto. |
| `contacto_tel` | `text` | NULL | Teléfono del contacto. |
| `dias_credito` | `int` | DEFAULT 0 | Días de crédito otorgados (0 = contado). |
| `notas` | `text` | NULL | Notas internas sobre el proveedor. |
| `activo` | `boolean` | DEFAULT true | Si está activo para nuevas OCs. |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

---

### 2.2 `productos`

**Propósito**: Catálogo maestro de SKUs lógicos. Incluye tanto polvos (Isopure Vainilla, ON Fresa, BCAA Uva) como vasos (vaso Smart Fit, vaso Planet Fitness).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `sku` | `text` | NOT NULL UNIQUE | Código interno del producto (ej. "ISO-VAIN", "VASO-SF"). |
| `nombre` | `text` | NOT NULL | Nombre legible (ej. "Isopure Whey Protein Vainilla"). |
| `tipo` | `producto_tipo` (enum) | NOT NULL | `polvo` o `vaso`. Determina flujos aplicables. |
| `marca` | `text` | NULL | Marca comercial (Isopure, Optimum Nutrition). Solo aplica a polvos. |
| `sabor` | `text` | NULL | Sabor (Vainilla, Fresa, etc.). Solo aplica a polvos. |
| `categoria` | `text` | NULL | Categoría (proteína, BCAA, pre-entreno, recovery). Solo polvos. |
| `cliente_exclusivo_id` | `uuid` | FK → `clientes(id)` NULL | Si el producto es exclusivo de un cliente (vasos Smart Fit, vasos Planet). NULL = universal. |
| `gramaje_cartucho_default` | `int` | DEFAULT 400 | Gramos por cartucho estándar para este SKU. Solo polvos. |
| `gramaje_servicio_default` | `int` | NULL | Gramos por shake típico. Solo polvos. |
| `precio_venta_default` | `numeric(10,2)` | NULL | Precio de venta sugerido. Solo polvos (los vasos no se cobran al consumidor). |
| `unidad_medida` | `text` | NOT NULL DEFAULT 'gramos' | `gramos` para polvos, `piezas` para vasos. |
| `notas` | `text` | NULL | Notas internas. |
| `activo` | `boolean` | DEFAULT true | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**Notas operativas**:
- Los vasos también se gestionan vía OC, recepción y lotes (sin encartuchado).
- El campo `cliente_exclusivo_id` evita el error de llevar vasos del cliente equivocado a una máquina.
- `gramaje_cartucho_default` permite que en el futuro existan cartuchos de otros tamaños (ej. 200 g para BCAA).

---

### 2.3 `presentaciones_proveedor`

**Propósito**: Un mismo SKU puede comprarse en distintas presentaciones según proveedor (costal 5kg, bote 2.4kg, caja con 50 vasos). Esta tabla define cada presentación comprable.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `producto_id` | `uuid` | FK → `productos(id)` NOT NULL | SKU lógico al que pertenece. |
| `proveedor_id` | `uuid` | FK → `proveedores(id)` NOT NULL | Proveedor que ofrece esta presentación. |
| `nombre_presentacion` | `text` | NOT NULL | Etiqueta descriptiva (ej. "Costal 5 kg", "Caja 50 vasos"). |
| `peso_neto_gramos` | `int` | NOT NULL CHECK (peso_neto_gramos > 0) | Para polvos: gramos nominales. Para vasos: 0 (no aplica). |
| `unidades_por_presentacion` | `int` | NOT NULL DEFAULT 1 | Para vasos: piezas por caja. Para polvos: 1 (un costal). |
| `costo_unitario` | `numeric(12,2)` | NOT NULL | Costo de la presentación completa (en MXN). |
| `moneda` | `text` | DEFAULT 'MXN' | Moneda del costo. |
| `sku_proveedor` | `text` | NULL | Código del producto en el catálogo del proveedor. |
| `activo` | `boolean` | DEFAULT true | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(producto_id, proveedor_id, nombre_presentacion)`.

---

### 2.4 `clientes`

**Propósito**: Catálogo de clientes corporativos donde están las máquinas (Smart Fit, Planet Fitness, otros).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `nombre` | `text` | NOT NULL UNIQUE | Nombre comercial del cliente. |
| `razon_social` | `text` | NULL | Razón social para reportes/facturación. |
| `rfc` | `text` | NULL | |
| `contacto_nombre` | `text` | NULL | Contacto principal del cliente. |
| `contacto_email` | `text` | NULL | Email para envío de reportes mensuales. |
| `contacto_tel` | `text` | NULL | |
| `emails_reporte` | `text[]` | NULL | Array de correos a los que se envía el reporte mensual. |
| `notas` | `text` | NULL | |
| `activo` | `boolean` | DEFAULT true | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

---

### 2.5 `ubicaciones`

**Propósito**: Sucursales/gimnasios específicos del cliente donde se instalan las máquinas (ej. "Smart Fit Félix Cuevas", "Planet Fitness Polanco").

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `cliente_id` | `uuid` | FK → `clientes(id)` NOT NULL | Cliente al que pertenece la ubicación. |
| `nombre` | `text` | NOT NULL | Nombre de la sucursal. |
| `direccion` | `text` | NULL | Dirección completa. |
| `colonia` | `text` | NULL | |
| `ciudad` | `text` | NULL | |
| `estado` | `text` | NULL | |
| `cp` | `text` | NULL | Código postal. |
| `lat` | `numeric(10,7)` | NULL | Latitud para geofence de check-in. |
| `lng` | `numeric(10,7)` | NULL | Longitud para geofence. |
| `radio_geofence_m` | `int` | DEFAULT 100 | Radio en metros para validar check-in. Configurable por ubicación (gyms en centros comerciales necesitan más). |
| `horario_apertura` | `time` | NULL | Hora de apertura del gym (útil para programar visitas). |
| `horario_cierre` | `time` | NULL | |
| `notas` | `text` | NULL | |
| `activo` | `boolean` | DEFAULT true | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

---

## Grupo 3 — Configuración y contratos

Parámetros globales del sistema y términos comerciales por cliente.

### 3.1 `config_global`

**Propósito**: Tabla genérica de parámetros del sistema. Permite cambiar valores sin migraciones (ej. comisión Nayax, % tope de merma, días default de calibración).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `clave` | `text` | NOT NULL | Identificador del parámetro (ej. `nayax_comision_porcentaje`, `merma_tolerancia_porcentaje`). |
| `valor` | `text` | NOT NULL | Valor del parámetro (siempre como texto; se parsea según necesidad). |
| `tipo_dato` | `text` | NOT NULL CHECK (tipo_dato IN ('numero','texto','booleano','json')) | Cómo interpretar el valor. |
| `descripcion` | `text` | NULL | Para qué sirve este parámetro. |
| `vigente_desde` | `timestamptz` | DEFAULT now() | Cuándo entra en vigor. |
| `vigente_hasta` | `timestamptz` | NULL | NULL = vigente. Cambios crean nuevo registro y cierran el anterior. |
| `actualizado_por` | `uuid` | FK → `profiles(id)` | Quién hizo el cambio. |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Restricción**: solo un registro por `clave` puede tener `vigente_hasta IS NULL` (vigente).

**Parámetros iniciales esperados**:
- `nayax_comision_porcentaje` = `5.50` (estimado)
- `merma_tolerancia_porcentaje` = `2.0`
- `dias_default_calibracion` = `90`
- `pesaje_discrepancia_alerta_porcentaje` = `5.0`
- `cartucho_gramaje_default` = `400`

---

### 3.2 `contratos_cliente`

**Propósito**: Términos comerciales con cada cliente. Histórico: cuando cambia el % de comisión o el modelo, se crea un nuevo registro y se cierra el anterior, sin perder histórico.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `cliente_id` | `uuid` | FK → `clientes(id)` NOT NULL | Cliente al que aplica. |
| `tipo` | `contrato_tipo` (enum) | NOT NULL | `renta_fija`, `revenue_share`, `mixto`. |
| `porcentaje_revenue_share` | `numeric(5,2)` | NULL | % que se lleva el cliente (ej. 10.00 para Smart Fit). |
| `base_calculo` | `text` | CHECK (base_calculo IN ('venta_bruta','venta_neta_sin_nayax')) | Sobre qué se calcula el revenue share. Smart Fit: `venta_neta_sin_nayax`. |
| `renta_mensual_fija` | `numeric(14,2)` | NULL | Renta mensual fija si aplica. |
| `vigente_desde` | `date` | NOT NULL | Inicio de vigencia. |
| `vigente_hasta` | `date` | NULL | NULL = vigente. |
| `notas` | `text` | NULL | Condiciones especiales del contrato. |
| `creado_por` | `uuid` | FK → `profiles(id)` | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**Notas operativas**: Para calcular el revenue share del mes a un cliente, se busca el contrato vigente en la fecha del cierre y se aplica sobre el agregado de `ventas_maquina` de sus ubicaciones.

---

## Grupo 4 — Máquinas y planograma

Inventario físico de máquinas, sus tolvas y la configuración (planograma) vigente.

### 4.1 `maquinas`

**Propósito**: Inventario de máquinas vending. Cada máquina está en una ubicación y tiene 8 tolvas.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `serie` | `text` | NOT NULL UNIQUE | Número de serie físico de la máquina (impreso por fabricante). |
| `alias` | `text` | NULL | Apodo legible (ej. "Maquina-Felix-Cuevas"). |
| `ubicacion_id` | `uuid` | FK → `ubicaciones(id)` NOT NULL | Dónde está instalada. |
| `modelo` | `text` | NULL | Modelo del fabricante. |
| `num_tolvas` | `int` | NOT NULL DEFAULT 8 CHECK (num_tolvas BETWEEN 1 AND 8) | Cuántas tolvas tiene físicamente. |
| `capacidad_max_tolva_g` | `int` | NOT NULL DEFAULT 2000 | Capacidad estándar por tolva. |
| `nayax_machine_id` | `text` | UNIQUE NULL | Identificador de la máquina en Nayax para conciliación de ventas. |
| `nayax_serial` | `text` | NULL | Serial reportado por Nayax (puede diferir de `serie`). |
| `frecuencia_visita_dias` | `int` | NOT NULL DEFAULT 7 | Cada cuántos días se visita por default. Configurable por máquina según consumo. |
| `qr_codigo` | `text` | UNIQUE NULL | Hash único para check-in por QR físico pegado en la máquina (respaldo al GPS). |
| `proxima_calibracion_fecha` | `date` | NULL | Próxima calibración programada (se actualiza tras cada calibración). |
| `estado` | `maquina_estado` (enum) | DEFAULT 'operativa' | `operativa`, `mantenimiento`, `baja`. |
| `fecha_instalacion` | `date` | NULL | Cuándo se instaló en la ubicación actual. |
| `notas` | `text` | NULL | |
| `activo` | `boolean` | DEFAULT true | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

---

### 4.2 `tolvas`

**Propósito**: Las tolvas individuales de cada máquina. Cada tolva tiene un producto asignado (planograma vigente), un gramaje por servicio y un inventario actual.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `maquina_id` | `uuid` | FK → `maquinas(id)` ON DELETE CASCADE NOT NULL | Máquina a la que pertenece. |
| `numero` | `int` | NOT NULL CHECK (numero BETWEEN 1 AND 8) | Posición física (1-8). |
| `producto_id` | `uuid` | FK → `productos(id)` NULL | Producto asignado en el planograma vigente. NULL si tolva vacía. |
| `gramaje_servicio` | `int` | NULL | Gramos dispensados por shake en esta tolva. |
| `precio_venta` | `numeric(10,2)` | NULL | Precio de venta configurado en esta tolva. |
| `nayax_item_code` | `text` | NULL | Mapeo al item code de Nayax (ej. "003") para identificar ventas. |
| `capacidad_max_g` | `int` | DEFAULT 2000 | Capacidad de esta tolva (puede diferir del default por máquina). |
| `inventario_actual_g` | `int` | NOT NULL DEFAULT 0 | Gramos actuales según kardex. Se actualiza con llenados y ventas. |
| `costo_promedio_g_actual` | `numeric(12,6)` | NOT NULL DEFAULT 0 | Costo promedio ponderado del polvo actualmente en la tolva. Se recalcula con cada llenado. |
| `ultimo_llenado_at` | `timestamptz` | NULL | Cuándo fue el último llenado. |
| `ultimo_pesaje_at` | `timestamptz` | NULL | Cuándo fue el último pesaje físico. |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(maquina_id, numero)`.

**Notas operativas**:
- Cuando se carga un cartucho a una tolva, `costo_promedio_g_actual` se recalcula así: `((inventario_actual_g × costo_actual) + (gramos_cargados × costo_batch)) / (inventario_actual_g + gramos_cargados)`.
- Cuando se hace pesaje físico, la diferencia se asienta como ajuste en `movimientos_inventario`.

---

### 4.3 `planograma_historico`

**Propósito**: Histórico inmutable de cambios al planograma. Cada vez que cambia qué producto está en qué tolva, qué gramaje o qué precio, se crea un nuevo registro. Esto permite reconstruir el estado del planograma en cualquier momento del pasado.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NOT NULL | |
| `tolva_numero` | `int` | NOT NULL | Posición física (1-8). |
| `producto_id` | `uuid` | FK → `productos(id)` NOT NULL | Producto asignado en este periodo. |
| `gramaje_servicio` | `int` | NOT NULL | Gramos por shake en este periodo. |
| `precio_venta` | `numeric(10,2)` | NOT NULL | Precio de venta en este periodo. |
| `nayax_item_code` | `text` | NULL | |
| `vigente_desde` | `timestamptz` | NOT NULL | Inicio de vigencia. |
| `vigente_hasta` | `timestamptz` | NULL | NULL = configuración actual vigente. |
| `motivo_cambio` | `text` | NULL | Por qué se cambió (ej. "lanzamiento nuevo SKU", "ajuste de precios anual"). |
| `creado_por` | `uuid` | FK → `profiles(id)` | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Notas operativas**: El registro con `vigente_hasta IS NULL` espeja lo que está en `tolvas`. Al cambiar el planograma, se actualiza este registro con `vigente_hasta = now()` y se inserta uno nuevo.

---

## Grupo 5 — Rutas y operadores

Organización geográfica de máquinas y asignación de operadores.

### 5.1 `rutas`

**Propósito**: Contenedor lógico de máquinas (ej. "Ruta Sur", "Ruta Norte"). Tiene un operador titular por default.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `nombre` | `text` | NOT NULL UNIQUE | Nombre de la ruta. |
| `descripcion` | `text` | NULL | Zona geográfica que cubre. |
| `operador_titular_id` | `uuid` | FK → `profiles(id)` NULL | Operador asignado por default. |
| `color_hex` | `text` | NULL | Color para visualización en mapa (ej. "#FF5733"). |
| `activa` | `boolean` | DEFAULT true | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

---

### 5.2 `ruta_maquinas`

**Propósito**: Asignación base de máquinas a rutas. Una máquina pertenece a una ruta por default, pero el planeador puede modificar la asignación del día (vía `asignacion_maquinas`).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `ruta_id` | `uuid` | PK (parcial), FK → `rutas(id)` ON DELETE CASCADE | |
| `maquina_id` | `uuid` | PK (parcial), FK → `maquinas(id)` ON DELETE CASCADE UNIQUE | Una máquina solo pertenece a una ruta base. |
| `orden` | `int` | DEFAULT 0 | Orden sugerido de visita dentro de la ruta. |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Clave primaria**: `(ruta_id, maquina_id)`.
**Restricción adicional**: `maquina_id` debe ser único globalmente (una máquina = una ruta base).

---

### 5.3 `asignaciones_diarias`

**Propósito**: La ruta que sale a operar un día específico. Toma como base `ruta_maquinas` pero puede modificarse por excepciones (ausencias, emergencias).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `fecha` | `date` | NOT NULL | Fecha de la asignación. |
| `ruta_id` | `uuid` | FK → `rutas(id)` NOT NULL | Ruta que se opera. |
| `operador_id` | `uuid` | FK → `profiles(id)` NOT NULL | Operador asignado (puede diferir del titular de la ruta). |
| `estado` | `asignacion_estado` (enum) | DEFAULT 'planeada' | `planeada`, `surtida`, `en_jornada`, `completada`, `cancelada`. |
| `notas` | `text` | NULL | |
| `creado_por` | `uuid` | FK → `profiles(id)` | Planeador que la creó. |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(fecha, ruta_id)` — una ruta solo se asigna una vez por día.

---

### 5.4 `asignacion_maquinas`

**Propósito**: Las máquinas específicas que se visitan en una asignación diaria. Permite override sobre `ruta_maquinas`.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `asignacion_id` | `uuid` | FK → `asignaciones_diarias(id)` ON DELETE CASCADE NOT NULL | |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NOT NULL | |
| `orden` | `int` | DEFAULT 0 | Orden de visita (puede diferir del default). |
| `origen` | `text` | CHECK (origen IN ('base_ruta','agregada_excepcion')) | Si viene de la ruta base o fue agregada manualmente. |
| `motivo_excepcion` | `excepcion_motivo` (enum) | NULL | Si origen = `agregada_excepcion`: `ausencia_operador`, `emergencia`, `mantenimiento`, `otro`. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(asignacion_id, maquina_id)`.

---

## Grupo 6 — Compras

Órdenes de compra a proveedores.

### 6.1 `ordenes_compra`

**Propósito**: Documento OC generado por el equipo de compras para solicitar producto a un proveedor.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `folio` | `text` | UNIQUE NOT NULL | Folio auto-generado vía secuencia (ej. `OC-000123`). |
| `proveedor_id` | `uuid` | FK → `proveedores(id)` NOT NULL | |
| `fecha_emision` | `date` | NOT NULL DEFAULT current_date | Fecha de emisión de la OC. |
| `fecha_esperada` | `date` | NULL | Fecha esperada de recepción. |
| `estado` | `oc_estado` (enum) | DEFAULT 'borrador' | `borrador`, `enviada`, `parcial`, `recibida`, `cancelada`. |
| `subtotal` | `numeric(14,2)` | DEFAULT 0 | Suma de items antes de impuestos. |
| `iva` | `numeric(14,2)` | DEFAULT 0 | IVA total. |
| `total` | `numeric(14,2)` | DEFAULT 0 | Total con impuestos. |
| `moneda` | `text` | DEFAULT 'MXN' | |
| `notas` | `text` | NULL | |
| `creado_por` | `uuid` | FK → `profiles(id)` | |
| `aprobado_por` | `uuid` | FK → `profiles(id)` NULL | Para flujos con aprobación. |
| `fecha_aprobacion` | `timestamptz` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**Notas operativas**:
- `estado` transiciona: `borrador` → `enviada` → (`parcial` →)? `recibida` o `cancelada`.
- `parcial` se activa cuando hay al menos una recepción que no cubre el total.
- `recibida` cuando `sum(recepcion_items.gramos)` o `cantidad` ≥ lo solicitado.

---

### 6.2 `oc_items`

**Propósito**: Items individuales de una OC (qué presentación se pidió y cuánto).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `oc_id` | `uuid` | FK → `ordenes_compra(id)` ON DELETE CASCADE NOT NULL | |
| `presentacion_id` | `uuid` | FK → `presentaciones_proveedor(id)` NOT NULL | Qué presentación se compra. |
| `cantidad` | `int` | NOT NULL CHECK (cantidad > 0) | Número de presentaciones (costales, botes, cajas). |
| `costo_unitario` | `numeric(12,2)` | NOT NULL | Costo por presentación (snapshot del precio al momento de la OC). |
| `subtotal_item` | `numeric(14,2)` | NOT NULL | `cantidad × costo_unitario`. |
| `recibido` | `int` | NOT NULL DEFAULT 0 | Cuántas presentaciones se han recibido contra esta línea. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

## Grupo 7 — Recepción y lotes

Llegada del producto al almacén y creación de lotes para PEPS.

### 7.1 `recepciones`

**Propósito**: Documento que registra la llegada física de producto a almacén contra una OC.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `folio` | `text` | UNIQUE NOT NULL | Folio auto-generado (ej. `REC-000045`). |
| `oc_id` | `uuid` | FK → `ordenes_compra(id)` NOT NULL | OC contra la que se recibe (siempre obligatoria, no hay recepciones sin OC). |
| `fecha` | `date` | NOT NULL DEFAULT current_date | |
| `recibido_por` | `uuid` | FK → `profiles(id)` NOT NULL | Almacenista que recibe. |
| `factura_proveedor` | `text` | NULL | Folio fiscal del proveedor (CFDI). |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

---

### 7.2 `lotes`

**Propósito**: Unidad de costeo PEPS. Cada vez que se recibe producto se crea uno o más lotes con su costo por gramo específico.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `codigo_lote` | `text` | NOT NULL UNIQUE | Código auto-generado patrón `MARCA-SABOR-YYYYMMDD-NN` (ej. `ISO-VAIN-20260516-01`). |
| `producto_id` | `uuid` | FK → `productos(id)` NOT NULL | |
| `proveedor_id` | `uuid` | FK → `proveedores(id)` NOT NULL | |
| `presentacion_id` | `uuid` | FK → `presentaciones_proveedor(id)` NULL | Presentación de origen. |
| `recepcion_id` | `uuid` | FK → `recepciones(id)` NOT NULL | Recepción que originó el lote. |
| `fecha_recepcion` | `date` | NOT NULL DEFAULT current_date | Fecha base para PEPS. |
| `fecha_caducidad` | `date` | NULL | Capturada del empaque. Informativa (no bloqueante). |
| `gramos_iniciales` | `int` | NOT NULL CHECK (gramos_iniciales > 0) | Peso real al recibir (puede diferir del nominal). |
| `gramos_disponibles_granel` | `int` | NOT NULL | Gramos que quedan en granel (decrementan al encartuchar). |
| `costo_por_gramo` | `numeric(12,6)` | NOT NULL | Costo derivado: `costo_unitario / peso_neto_gramos`. |
| `unidades_iniciales` | `int` | NULL | Para vasos: piezas iniciales. NULL para polvos. |
| `unidades_disponibles` | `int` | NULL | Para vasos: piezas disponibles. NULL para polvos. |
| `notas` | `text` | NULL | |
| `activo` | `boolean` | DEFAULT true | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Notas operativas**:
- Para vasos: se llenan `unidades_iniciales` y `unidades_disponibles`. Los campos de gramos se ponen en 0.
- Para polvos: se llenan gramos. Los campos de unidades quedan NULL.
- PEPS estricto: el orden de consumo es por `fecha_recepcion ASC`.

---

### 7.3 `recepcion_items`

**Propósito**: Detalle de cada línea recibida. Relaciona la recepción con la OC y el lote generado.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `recepcion_id` | `uuid` | FK → `recepciones(id)` ON DELETE CASCADE NOT NULL | |
| `oc_item_id` | `uuid` | FK → `oc_items(id)` NOT NULL | Item de la OC contra el que se recibe. |
| `lote_id` | `uuid` | FK → `lotes(id)` NOT NULL | Lote generado. |
| `presentaciones_recibidas` | `int` | NOT NULL CHECK (presentaciones_recibidas > 0) | # de costales/botes/cajas recibidos. |
| `peso_total_gramos` | `int` | NOT NULL | Peso real total medido en báscula (solo polvos). |
| `unidades_totales` | `int` | NULL | Unidades totales (solo vasos). |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

## Grupo 8 — Encartuchado

Conversión de granel a cartuchos. Permite mezcla de lotes con trazabilidad PEPS.

### 8.1 `encartuchados`

**Propósito**: Batch de producción de cartuchos. Cada batch genera N cartuchos de un mismo SKU, consumiendo granel de uno o varios lotes.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `folio` | `text` | UNIQUE NOT NULL | Auto-generado (ej. `ENC-000234`). |
| `producto_id` | `uuid` | FK → `productos(id)` NOT NULL | SKU al que pertenecen los cartuchos. |
| `fecha` | `timestamptz` | DEFAULT now() | Fecha del batch. |
| `cartuchos_producidos` | `int` | NOT NULL CHECK (cartuchos_producidos > 0) | Cuántos cartuchos salieron. |
| `gramos_por_cartucho` | `int` | NOT NULL DEFAULT 400 | Gramaje del cartucho en este batch. |
| `gramos_totales_consumidos` | `int` | NOT NULL | Suma del granel consumido de todos los lotes. |
| `gramos_merma` | `int` | NOT NULL | Calculado: `gramos_totales_consumidos − (cartuchos_producidos × gramos_por_cartucho)`. |
| `costo_promedio_g` | `numeric(12,6)` | NOT NULL | Costo promedio ponderado de la mezcla de lotes consumidos. |
| `cantidad_disponible` | `int` | NOT NULL | Cartuchos disponibles del batch (decrementa con surtidos). Igual a `cartuchos_producidos` al crear. |
| `operario_id` | `uuid` | FK → `profiles(id)` | Quién hizo el encartuchado. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Notas operativas**:
- PEPS de cartuchos: se ordena por `fecha ASC` al asignar a surtidos.
- `cantidad_disponible` reemplaza a la tabla `inventario_cartuchos` (la integré aquí para simplificar).

---

### 8.2 `encartuchado_lotes`

**Propósito**: Desglose de qué lote(s) aportaron al batch y cuánto. Permite reconstruir el PEPS estricto aún con mezcla.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `encartuchado_id` | `uuid` | FK → `encartuchados(id)` ON DELETE CASCADE NOT NULL | |
| `lote_id` | `uuid` | FK → `lotes(id)` NOT NULL | |
| `gramos_consumidos` | `int` | NOT NULL CHECK (gramos_consumidos > 0) | Gramos de este lote que entraron al batch. |
| `costo_por_gramo_lote` | `numeric(12,6)` | NOT NULL | Snapshot del costo del lote al momento del batch. |
| `valor_aportado` | `numeric(14,2)` | NOT NULL | `gramos_consumidos × costo_por_gramo_lote`. |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(encartuchado_id, lote_id)`.

**Cálculo del `costo_promedio_g` del batch**:
```
costo_promedio_g = SUM(valor_aportado) / gramos_totales_consumidos
```

---

## Grupo 9 — Surtido

Picking de cartuchos y vasos para una ruta del día.

### 9.1 `surtidos`

**Propósito**: Documento de surtido para una asignación diaria. Lo crea el planeador y lo ejecuta almacén.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `folio` | `text` | UNIQUE NOT NULL | Auto-generado (ej. `SUR-000567`). |
| `asignacion_id` | `uuid` | FK → `asignaciones_diarias(id)` NOT NULL UNIQUE | Asignación a la que pertenece. |
| `fecha` | `timestamptz` | DEFAULT now() | |
| `estado` | `surtido_estado` (enum) | DEFAULT 'pendiente' | `pendiente`, `en_proceso`, `completado`. |
| `creado_por` | `uuid` | FK → `profiles(id)` | Planeador que generó el surtido. |
| `surtido_por` | `uuid` | FK → `profiles(id)` NULL | Almacenista que físicamente preparó los cartuchos. |
| `fecha_completado` | `timestamptz` | NULL | |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

---

### 9.2 `surtido_items`

**Propósito**: Detalle del surtido: por máquina y producto, cuántos cartuchos/vasos se llevan, y de qué batch/lote vienen (PEPS aplicado).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `surtido_id` | `uuid` | FK → `surtidos(id)` ON DELETE CASCADE NOT NULL | |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NOT NULL | Máquina destino. |
| `producto_id` | `uuid` | FK → `productos(id)` NOT NULL | Producto (polvo o vaso). |
| `cartuchos_sugeridos` | `int` | NOT NULL DEFAULT 0 | Cantidad sugerida por algoritmo de máx/mín (solo polvos). |
| `cartuchos_entregados` | `int` | NOT NULL DEFAULT 0 | Cantidad que físicamente entrega almacén al operador. |
| `encartuchado_id` | `uuid` | FK → `encartuchados(id)` NULL | Batch de cartuchos asignado por PEPS (solo polvos). |
| `vasos_sugeridos` | `int` | NOT NULL DEFAULT 0 | Vasos sugeridos (solo si el producto es vaso). |
| `vasos_entregados` | `int` | NOT NULL DEFAULT 0 | Vasos entregados. |
| `lote_vaso_id` | `uuid` | FK → `lotes(id)` NULL | Lote de vasos asignado por PEPS (solo vasos). |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Notas operativas**:
- Si `producto.tipo = 'polvo'`: se llenan campos de cartuchos y `encartuchado_id`.
- Si `producto.tipo = 'vaso'`: se llenan campos de vasos y `lote_vaso_id`.
- Si la sugerencia requiere más cartuchos de los disponibles en un solo batch, se generan múltiples `surtido_items` con distintos batches (split por PEPS).

---

## Grupo 10 — Operación de campo

Lo que hace el operador en ruta: inicio de jornada, check-ins, llenados, devoluciones, incidencias.

### 10.1 `jornadas`

**Propósito**: Inicio de jornada del operador (cuándo sale del almacén). No hay check-out final (la última máquina es el cierre implícito).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `asignacion_id` | `uuid` | FK → `asignaciones_diarias(id)` NOT NULL UNIQUE | Asignación a la que pertenece. |
| `operador_id` | `uuid` | FK → `profiles(id)` NOT NULL | |
| `hora_inicio` | `timestamptz` | NOT NULL DEFAULT now() | Cuando el operador marca "iniciar jornada". |
| `lat_inicio` | `numeric(10,7)` | NULL | GPS al iniciar (validar que está en almacén). |
| `lng_inicio` | `numeric(10,7)` | NULL | |
| `hora_ultima_actividad` | `timestamptz` | NULL | Se actualiza con cada check-in/llenado. Sirve como cierre implícito. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

### 10.2 `check_ins`

**Propósito**: Llegada del operador a una máquina específica. Valida proximidad por GPS o QR.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `asignacion_id` | `uuid` | FK → `asignaciones_diarias(id)` NOT NULL | |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NOT NULL | |
| `operador_id` | `uuid` | FK → `profiles(id)` NOT NULL | |
| `fecha_entrada` | `timestamptz` | NOT NULL DEFAULT now() | Momento del check-in. |
| `fecha_salida` | `timestamptz` | NULL | Cuando el operador cierra esta máquina y pasa a la siguiente. |
| `tiempo_en_sitio_seg` | `int` | NULL | Calculado: `fecha_salida − fecha_entrada` en segundos. |
| `lat` | `numeric(10,7)` | NULL | GPS reportado por el celular. |
| `lng` | `numeric(10,7)` | NULL | |
| `precision_m` | `numeric(8,2)` | NULL | Precisión reportada por el GPS (mts). |
| `validado` | `boolean` | DEFAULT false | true si está dentro del geofence de la ubicación. |
| `metodo` | `checkin_metodo` (enum) | NOT NULL | `gps`, `qr`, `manual_supervisado`. |
| `motivo_manual` | `text` | NULL | Si método = `manual_supervisado`: razón obligatoria. |
| `foto_evidencia_url` | `text` | NULL | URL en Storage (recomendado si método ≠ gps validado). |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(asignacion_id, maquina_id)` — un check-in por máquina por jornada (re-check-ins generan otro registro con motivo).

---

### 10.3 `llenados`

**Propósito**: El acto de llenar las tolvas de una máquina durante un check-in.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `check_in_id` | `uuid` | FK → `check_ins(id)` NOT NULL UNIQUE | Check-in al que pertenece. |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NOT NULL | (redundante pero útil para queries). |
| `operador_id` | `uuid` | FK → `profiles(id)` NOT NULL | |
| `fecha` | `timestamptz` | DEFAULT now() | |
| `evidencia_url` | `text` | NULL | Foto de tolvas llenas (opcional pero recomendado). |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

### 10.4 `llenado_items`

**Propósito**: Detalle del llenado por tolva. Aquí se calcula automáticamente cuántos cartuchos quedan pendientes de devolución (los planeados que no se cargaron).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `llenado_id` | `uuid` | FK → `llenados(id)` ON DELETE CASCADE NOT NULL | |
| `tolva_id` | `uuid` | FK → `tolvas(id)` NOT NULL | Tolva específica. |
| `surtido_item_id` | `uuid` | FK → `surtido_items(id)` NOT NULL | Surtido del que vienen los cartuchos planeados. |
| `cartuchos_planeados` | `int` | NOT NULL | Cuántos cartuchos llevaba el operador para esta tolva. |
| `cartuchos_cargados` | `int` | NOT NULL CHECK (cartuchos_cargados >= 0) | Cuántos efectivamente cargó. |
| `cartuchos_devolucion` | `int` | NOT NULL GENERATED ALWAYS AS (cartuchos_planeados - cartuchos_cargados) STORED | Cálculo automático. |
| `gramos_cargados` | `int` | NOT NULL | `cartuchos_cargados × gramos_por_cartucho del batch`. |
| `encartuchado_id` | `uuid` | FK → `encartuchados(id)` NOT NULL | Batch del que viene el cartucho. |
| `inventario_tolva_antes` | `int` | NULL | Snapshot: gramos en tolva antes del llenado. |
| `inventario_tolva_despues` | `int` | NULL | Snapshot: gramos en tolva después del llenado. |
| `costo_promedio_g_tolva_antes` | `numeric(12,6)` | NULL | Snapshot del costo promedio antes del llenado. |
| `costo_promedio_g_tolva_despues` | `numeric(12,6)` | NULL | Costo promedio recalculado tras el llenado. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Notas operativas**:
- Los snapshots de inventario y costo permiten auditoría posterior sin reconstruir desde kardex.
- Si `cartuchos_devolucion > 0`, se crea automáticamente un registro en `devoluciones_almacen`.

---

### 10.5 `devoluciones_almacen`

**Propósito**: Cartuchos que el operador no logró cargar y regresan al almacén el día siguiente.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `llenado_item_id` | `uuid` | FK → `llenado_items(id)` NOT NULL UNIQUE | Origen de la devolución. |
| `operador_id` | `uuid` | FK → `profiles(id)` NOT NULL | |
| `producto_id` | `uuid` | FK → `productos(id)` NOT NULL | |
| `encartuchado_id` | `uuid` | FK → `encartuchados(id)` NOT NULL | Batch al que regresa. |
| `cantidad_calculada` | `int` | NOT NULL | Lo que el sistema calculó como devolución. |
| `cantidad_recibida_almacen` | `int` | NULL | Lo que almacén físicamente recibe. |
| `estado` | `devolucion_estado` (enum) | DEFAULT 'pendiente_devolucion' | `pendiente_devolucion`, `recibida_ok`, `recibida_con_diferencia`. |
| `recibida_por` | `uuid` | FK → `profiles(id)` NULL | Almacenista que recibe. |
| `fecha_recepcion` | `timestamptz` | NULL | |
| `incidencia_id` | `uuid` | FK → `incidencias(id)` NULL | Si hay diferencia, se genera incidencia automática. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

---

### 10.6 `incidencias`

**Propósito**: Registro de eventos anómalos detectados en campo (o en cualquier parte del flujo).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `folio` | `text` | UNIQUE NOT NULL | Auto-generado (ej. `INC-000089`). |
| `tipo` | `incidencia_tipo` (enum) | NOT NULL | Ver enums. |
| `severidad` | `incidencia_severidad` (enum) | NOT NULL DEFAULT 'media' | `baja`, `media`, `alta`. |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NULL | Máquina relacionada (si aplica). |
| `operador_id` | `uuid` | FK → `profiles(id)` NULL | Operador que la reportó. |
| `check_in_id` | `uuid` | FK → `check_ins(id)` NULL | Durante qué check-in se reportó. |
| `descripcion` | `text` | NOT NULL | Descripción del operador o detector. |
| `foto_url` | `text` | NULL | Evidencia fotográfica. |
| `estado` | `incidencia_estado` (enum) | DEFAULT 'abierta' | `abierta`, `en_revision`, `resuelta`, `descartada`. |
| `requiere_autorizacion_merma` | `boolean` | DEFAULT false | true si la incidencia implica descontar producto como merma (cartucho dañado/perdido). |
| `cartuchos_afectados` | `int` | NULL | Si aplica: cuántos cartuchos. |
| `producto_afectado_id` | `uuid` | FK → `productos(id)` NULL | |
| `encartuchado_afectado_id` | `uuid` | FK → `encartuchados(id)` NULL | Batch afectado para descuento. |
| `autorizada_por` | `uuid` | FK → `profiles(id)` NULL | Quien autoriza la merma (planeador). |
| `fecha_autorizacion` | `timestamptz` | NULL | |
| `fecha_apertura` | `timestamptz` | NOT NULL DEFAULT now() | |
| `fecha_cierre` | `timestamptz` | NULL | |
| `notas_resolucion` | `text` | NULL | Comentarios al cerrar. |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**Notas operativas**:
- Si la incidencia es de tipo `cartucho_danado` o `cartucho_perdido`, automáticamente se marca `requiere_autorizacion_merma = true` y se notifica al planeador.
- Al autorizar, se genera el movimiento de merma en `movimientos_inventario`.

---

## Grupo 11 — Cierre mensual y conteos

Cierre integral del periodo: pesaje de tolvas + conteo físico de almacén.

### 11.1 `cierres_mensuales`

**Propósito**: Periodo contable mensual. Coordina pesajes de máquinas y conteos de almacén. Cuando se cierra, no se permiten más movimientos en ese periodo.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `periodo_mes` | `int` | NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12) | |
| `periodo_anio` | `int` | NOT NULL | |
| `estado` | `cierre_estado` (enum) | DEFAULT 'abierto' | `abierto`, `en_proceso`, `cerrado`. |
| `fecha_inicio_cierre` | `timestamptz` | NULL | Cuándo se inició el proceso de cierre. |
| `fecha_cierre` | `timestamptz` | NULL | Cuándo se cerró definitivamente. |
| `cerrado_por` | `uuid` | FK → `profiles(id)` NULL | Quién cerró el periodo. |
| `total_maquinas_periodo` | `int` | NULL | Cuántas máquinas activas había en el periodo (para tracking de avance). |
| `maquinas_pesadas` | `int` | DEFAULT 0 | Cuántas máquinas tienen pesaje completo. |
| `conteo_almacen_completado` | `boolean` | DEFAULT false | Si ya se hizo el conteo físico de almacén. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(periodo_mes, periodo_anio)`.

---

### 11.2 `pesajes_maquina`

**Propósito**: Pesaje físico de tolvas de una máquina en una visita específica del cierre.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `cierre_id` | `uuid` | FK → `cierres_mensuales(id)` NOT NULL | |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NOT NULL | |
| `check_in_id` | `uuid` | FK → `check_ins(id)` NOT NULL | Durante qué visita se hizo. |
| `operador_id` | `uuid` | FK → `profiles(id)` NOT NULL | |
| `fecha` | `timestamptz` | DEFAULT now() | |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(cierre_id, maquina_id)` — una máquina se pesa una vez por cierre.

---

### 11.3 `pesaje_tolva_items`

**Propósito**: Detalle del pesaje por tolva.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `pesaje_id` | `uuid` | FK → `pesajes_maquina(id)` ON DELETE CASCADE NOT NULL | |
| `tolva_id` | `uuid` | FK → `tolvas(id)` NOT NULL | |
| `gramos_medidos` | `int` | NOT NULL CHECK (gramos_medidos >= 0) | Lo que arrojó la báscula. |
| `gramos_teoricos` | `int` | NOT NULL | Snapshot del kardex al momento del pesaje. |
| `diferencia_gramos` | `int` | GENERATED ALWAYS AS (gramos_medidos - gramos_teoricos) STORED | Negativo = merma. |
| `diferencia_porcentaje` | `numeric(6,2)` | NULL | Calculado a nivel app: `(diferencia / teorico) × 100`. |
| `valor_diferencia` | `numeric(14,2)` | NULL | `diferencia_gramos × costo_promedio_tolva`. |
| `foto_url` | `text` | NULL | Foto de la báscula como evidencia. |
| `alerta_generada` | `boolean` | DEFAULT false | true si `|diferencia_porcentaje| > tolerancia`. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

### 11.4 `conteos_almacen`

**Propósito**: Conteo físico completo de almacén dentro del cierre mensual.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `cierre_id` | `uuid` | FK → `cierres_mensuales(id)` NOT NULL UNIQUE | Un conteo por cierre. |
| `fecha` | `timestamptz` | DEFAULT now() | |
| `realizado_por` | `uuid` | FK → `profiles(id)` NOT NULL | |
| `supervisor_id` | `uuid` | FK → `profiles(id)` NULL | Validación adicional. |
| `estado` | `text` | CHECK (estado IN ('en_proceso','completado')) DEFAULT 'en_proceso' | |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

---

### 11.5 `conteo_granel_items`

**Propósito**: Gramos físicos contados por lote en granel.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `conteo_id` | `uuid` | FK → `conteos_almacen(id)` ON DELETE CASCADE NOT NULL | |
| `lote_id` | `uuid` | FK → `lotes(id)` NOT NULL | |
| `gramos_sistema` | `int` | NOT NULL | Snapshot de `lotes.gramos_disponibles_granel`. |
| `gramos_fisicos` | `int` | NOT NULL CHECK (gramos_fisicos >= 0) | Lo que pesa físicamente. |
| `diferencia` | `int` | GENERATED ALWAYS AS (gramos_fisicos - gramos_sistema) STORED | |
| `valor_diferencia` | `numeric(14,2)` | NULL | `diferencia × costo_por_gramo del lote`. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(conteo_id, lote_id)`.

---

### 11.6 `conteo_cartuchos_items`

**Propósito**: Cantidad física de cartuchos contada por batch de encartuchado.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `conteo_id` | `uuid` | FK → `conteos_almacen(id)` ON DELETE CASCADE NOT NULL | |
| `producto_id` | `uuid` | FK → `productos(id)` NOT NULL | |
| `encartuchado_id` | `uuid` | FK → `encartuchados(id)` NOT NULL | |
| `cantidad_sistema` | `int` | NOT NULL | Snapshot de `encartuchados.cantidad_disponible`. |
| `cantidad_fisica` | `int` | NOT NULL CHECK (cantidad_fisica >= 0) | Cartuchos físicos contados. |
| `diferencia` | `int` | GENERATED ALWAYS AS (cantidad_fisica - cantidad_sistema) STORED | |
| `valor_diferencia` | `numeric(14,2)` | NULL | `diferencia × gramos_por_cartucho × costo_promedio_g del batch`. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(conteo_id, producto_id, encartuchado_id)`.

---

## Grupo 12 — Kardex (movimientos)

La tabla más importante del sistema. Append-only, registra cada movimiento de inventario.

### 12.1 `movimientos_inventario`

**Propósito**: Bitácora inmutable de todos los movimientos de inventario. Se alimenta vía triggers en cada operación (recepción, encartuchado, surtido, llenado, venta, pesaje, conteo). Permite reconstruir el inventario en cualquier punto del tiempo y calcular costos por máquina/cliente/SKU.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `fecha` | `timestamptz` | NOT NULL DEFAULT now() | Cuándo ocurrió el movimiento. |
| `tipo` | `movimiento_tipo` (enum) | NOT NULL | Ver enums. |
| `producto_id` | `uuid` | FK → `productos(id)` NOT NULL | |
| `lote_id` | `uuid` | FK → `lotes(id)` NULL | Para movimientos de granel. |
| `encartuchado_id` | `uuid` | FK → `encartuchados(id)` NULL | Para movimientos de cartuchos. |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NULL | Si aplica (llenado, venta, pesaje). |
| `tolva_id` | `uuid` | FK → `tolvas(id)` NULL | Si aplica. |
| `cliente_id` | `uuid` | FK → `clientes(id)` NULL | Derivado de la ubicación de la máquina, redundante pero útil para queries por cliente. |
| `presentacion` | `mov_presentacion` (enum) | NOT NULL | `granel`, `cartucho`, `polvo_en_tolva`, `vaso`. |
| `gramos` | `int` | NOT NULL DEFAULT 0 | Signed: positivo = entra, negativo = sale. |
| `cantidad_cartuchos` | `int` | NOT NULL DEFAULT 0 | Signed, si aplica. |
| `cantidad_vasos` | `int` | NOT NULL DEFAULT 0 | Signed, si aplica. |
| `costo_por_gramo_snapshot` | `numeric(12,6)` | NOT NULL DEFAULT 0 | Costo aplicable en este momento. |
| `valor_movimiento` | `numeric(14,2)` | NOT NULL DEFAULT 0 | `ABS(gramos) × costo_por_gramo_snapshot` con signo. |
| `referencia_tabla` | `text` | NOT NULL | Tabla origen (ej. `recepciones`, `encartuchados`, `llenado_items`). |
| `referencia_id` | `uuid` | NOT NULL | ID en la tabla origen. |
| `usuario_id` | `uuid` | FK → `profiles(id)` | Quién originó el movimiento. |
| `cierre_id` | `uuid` | FK → `cierres_mensuales(id)` NULL | Periodo contable al que pertenece (calculado por fecha). |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Índices recomendados**:
- `(fecha desc)`
- `(producto_id, fecha desc)`
- `(maquina_id, fecha desc)`
- `(cliente_id, fecha desc)`
- `(lote_id, fecha desc)`
- `(encartuchado_id, fecha desc)`
- `(cierre_id)`
- `(referencia_tabla, referencia_id)`

**Notas operativas**:
- Esta tabla **nunca se borra ni actualiza**. Las correcciones se hacen con asientos compensatorios (movimientos de signo opuesto).
- Triggers automáticos en `recepcion_items`, `encartuchado_lotes`, `surtido_items`, `llenado_items`, `ventas_maquina`, `pesaje_tolva_items`, `conteo_granel_items`, `conteo_cartuchos_items` escriben aquí.

---

## Grupo 13 — Ventas (Nayax)

Ingesta de transacciones desde Nayax cada hora.

### 13.1 `ventas_maquina`

**Propósito**: Cada transacción de venta de un shake registrada en Nayax. Incluye desglose de costos y margen calculados en el momento de ingesta.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `nayax_transaction_id` | `text` | NOT NULL UNIQUE | ID único de Nayax. Garantiza deduplicación en reingesta. |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NOT NULL | Resolved por `nayax_machine_id`. |
| `tolva_id` | `uuid` | FK → `tolvas(id)` NULL | Resolved por `nayax_item_code`. |
| `producto_id` | `uuid` | FK → `productos(id)` NULL | Heredado de la tolva al momento de la venta. |
| `cliente_id` | `uuid` | FK → `clientes(id)` NULL | Heredado de la ubicación de la máquina. |
| `fecha_transaccion` | `timestamptz` | NOT NULL | Cuándo ocurrió la venta (timestamp de Nayax). |
| `gramos_dispensados` | `int` | NOT NULL | Gramos servidos en este shake. |
| `precio_bruto` | `numeric(10,2)` | NOT NULL | Lo que cobró Nayax al cliente final. |
| `comision_nayax_estimada` | `numeric(10,2)` | NOT NULL DEFAULT 0 | `precio_bruto × % comisión vigente` (config_global). |
| `precio_neto` | `numeric(10,2)` | NOT NULL | `precio_bruto − comision_nayax_estimada`. |
| `costo_polvo` | `numeric(10,2)` | NOT NULL DEFAULT 0 | `gramos_dispensados × costo_promedio_g de la tolva al momento`. |
| `costo_vaso` | `numeric(10,2)` | NOT NULL DEFAULT 0 | Costo del vaso asignado a esta máquina (según cliente). |
| `utilidad_bruta` | `numeric(10,2)` | NOT NULL DEFAULT 0 | `precio_neto − costo_polvo − costo_vaso`. |
| `margen_porcentaje` | `numeric(6,2)` | NULL | `utilidad_bruta / precio_neto × 100`. |
| `metodo_pago` | `text` | NULL | `tarjeta`, `qr`, `efectivo`. |
| `ticket_id_nayax` | `text` | NULL | Folio del ticket de Nayax. |
| `cargado_at` | `timestamptz` | DEFAULT now() | Cuándo entró al sistema (puede haber lag vs `fecha_transaccion`). |
| `sync_log_id` | `uuid` | FK → `nayax_sync_log(id)` NULL | A qué corrida de sync pertenece. |
| `cierre_id` | `uuid` | FK → `cierres_mensuales(id)` NULL | Periodo contable. |
| `notas` | `text` | NULL | |

**Índices recomendados**:
- `(maquina_id, fecha_transaccion desc)`
- `(cliente_id, fecha_transaccion desc)`
- `(producto_id, fecha_transaccion desc)`
- `(fecha_transaccion desc)`
- `(cierre_id)`

---

### 13.2 `nayax_sync_log`

**Propósito**: Bitácora de las corridas del cron de ingesta de Nayax. Permite monitorear health, lag y errores.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `inicio` | `timestamptz` | NOT NULL DEFAULT now() | Inicio de la corrida. |
| `fin` | `timestamptz` | NULL | Fin de la corrida. |
| `duracion_seg` | `int` | NULL | Duración total. |
| `cursor_desde` | `timestamptz` | NULL | Desde qué fecha se jaló (cursor anterior). |
| `cursor_hasta` | `timestamptz` | NULL | Hasta qué fecha. |
| `transacciones_jaladas` | `int` | DEFAULT 0 | Total recibidas. |
| `transacciones_nuevas` | `int` | DEFAULT 0 | Insertadas (descontando duplicados). |
| `transacciones_duplicadas` | `int` | DEFAULT 0 | Ignoradas por dedup. |
| `errores` | `int` | DEFAULT 0 | Cuántas fallaron. |
| `lag_minutos` | `int` | NULL | Lag entre última transacción y `now()`. |
| `estado` | `text` | CHECK (estado IN ('exitoso','parcial','fallido')) | |
| `mensaje_error` | `text` | NULL | Stack trace o mensaje si hubo error. |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

## Grupo 14 — Calibración de máquinas

Control de calibración de dispensación de polvo.

### 14.1 `calibraciones_maquina`

**Propósito**: Registro de calibraciones de tolvas (verificación de que el gramaje real coincide con el configurado).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NOT NULL | |
| `tolva_id` | `uuid` | FK → `tolvas(id)` NULL | NULL si es calibración de máquina completa (todas las tolvas). |
| `fecha` | `timestamptz` | DEFAULT now() | |
| `tipo` | `calibracion_tipo` (enum) | NOT NULL | `preventiva_programada`, `correctiva_por_alerta`, `post_mantenimiento`. |
| `tecnico_id` | `uuid` | FK → `profiles(id)` NOT NULL | Quién hizo la calibración. |
| `gramaje_esperado` | `int` | NOT NULL | Lo configurado en la tolva. |
| `gramaje_medido_1` | `int` | NOT NULL | Primera prueba de dispensación. |
| `gramaje_medido_2` | `int` | NOT NULL | Segunda prueba. |
| `gramaje_medido_3` | `int` | NOT NULL | Tercera prueba. |
| `gramaje_promedio` | `numeric(8,2)` | GENERATED ALWAYS AS ((gramaje_medido_1 + gramaje_medido_2 + gramaje_medido_3) / 3.0) STORED | Promedio de las 3. |
| `desviacion_porcentaje` | `numeric(6,2)` | NULL | `(promedio − esperado) / esperado × 100`. |
| `ajuste_aplicado` | `boolean` | DEFAULT false | Si se aplicó ajuste físico/software. |
| `descripcion_ajuste` | `text` | NULL | Qué se hizo. |
| `alerta_origen_id` | `uuid` | FK → `alertas(id)` NULL | Si vino de una alerta. |
| `incidencia_origen_id` | `uuid` | FK → `incidencias(id)` NULL | Si vino de una incidencia. |
| `proxima_calibracion_sugerida` | `date` | NULL | Cuándo debería ser la siguiente. |
| `foto_url` | `text` | NULL | Evidencia. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

**Notas operativas**:
- Al cerrar una calibración, se actualiza `maquinas.proxima_calibracion_fecha`.
- Cualquier desviación > 5% genera incidencia automática.

---

## Grupo 15 — Reportes y alertas

Generación y envío de reportes mensuales a clientes; alertas automáticas del sistema.

### 15.1 `reportes_cliente`

**Propósito**: Reportes mensuales generados y enviados a cada cliente.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `cliente_id` | `uuid` | FK → `clientes(id)` NOT NULL | |
| `periodo_mes` | `int` | NOT NULL | |
| `periodo_anio` | `int` | NOT NULL | |
| `cierre_id` | `uuid` | FK → `cierres_mensuales(id)` NOT NULL | Cierre del que se generó. |
| `estado` | `reporte_estado` (enum) | DEFAULT 'en_generacion' | `en_generacion`, `generado`, `aprobado`, `enviado`, `error`. |
| `fecha_generacion` | `timestamptz` | NULL | |
| `fecha_envio` | `timestamptz` | NULL | |
| `archivo_pdf_url` | `text` | NULL | URL del PDF en Storage. |
| `archivo_csv_url` | `text` | NULL | URL del CSV de detalle (opcional). |
| `enviado_a` | `text[]` | NULL | Correos donde se envió. |
| `total_consumo_g` | `int` | NULL | Snapshot: gramos vendidos en el periodo. |
| `total_shakes` | `int` | NULL | Snapshot: # de shakes vendidos. |
| `total_ventas_brutas` | `numeric(14,2)` | NULL | Snapshot: ventas brutas. |
| `total_ventas_netas` | `numeric(14,2)` | NULL | Snapshot: ventas netas (sin Nayax). |
| `comision_cliente` | `numeric(14,2)` | NULL | Snapshot: lo que se paga al cliente (revenue share). |
| `aprobado_por` | `uuid` | FK → `profiles(id)` NULL | Quién aprobó antes del envío. |
| `notas` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | DEFAULT now() | |

**Restricción única**: `(cliente_id, periodo_mes, periodo_anio)`.

---

### 15.2 `alertas`

**Propósito**: Alertas automáticas del sistema (máquina sin venta, discrepancia de pesaje, etc.).

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `tipo` | `alerta_tipo` (enum) | NOT NULL | `maquina_sin_venta_24h`, `discrepancia_pesaje_alta`. (Extensible en el futuro.) |
| `severidad` | `alerta_severidad` (enum) | NOT NULL DEFAULT 'warning' | `info`, `warning`, `critical`. |
| `maquina_id` | `uuid` | FK → `maquinas(id)` NULL | Si aplica. |
| `tolva_id` | `uuid` | FK → `tolvas(id)` NULL | Si aplica. |
| `mensaje` | `text` | NOT NULL | Mensaje legible. |
| `datos_jsonb` | `jsonb` | NULL | Datos adicionales estructurados. |
| `notificada_a` | `uuid[]` | NULL | Array de user_ids notificados. |
| `canales_envio` | `text[]` | NULL | `email`, `push`, `dashboard`. |
| `estado` | `alerta_estado` (enum) | DEFAULT 'activa' | `activa`, `atendida`, `descartada`. |
| `fecha_apertura` | `timestamptz` | NOT NULL DEFAULT now() | |
| `fecha_cierre` | `timestamptz` | NULL | |
| `atendida_por` | `uuid` | FK → `profiles(id)` NULL | |
| `notas_resolucion` | `text` | NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

## Tipos enumerados (ENUMs)

Lista completa de tipos enumerados a crear en Postgres:

```sql
CREATE TYPE app_role AS ENUM ('direccion','compras','almacen','planeador','operador','admin');

CREATE TYPE producto_tipo AS ENUM ('polvo','vaso');

CREATE TYPE contrato_tipo AS ENUM ('renta_fija','revenue_share','mixto');

CREATE TYPE maquina_estado AS ENUM ('operativa','mantenimiento','baja');

CREATE TYPE asignacion_estado AS ENUM ('planeada','surtida','en_jornada','completada','cancelada');

CREATE TYPE excepcion_motivo AS ENUM ('ausencia_operador','emergencia','mantenimiento','otro');

CREATE TYPE oc_estado AS ENUM ('borrador','enviada','parcial','recibida','cancelada');

CREATE TYPE surtido_estado AS ENUM ('pendiente','en_proceso','completado');

CREATE TYPE checkin_metodo AS ENUM ('gps','qr','manual_supervisado');

CREATE TYPE devolucion_estado AS ENUM ('pendiente_devolucion','recibida_ok','recibida_con_diferencia');

CREATE TYPE incidencia_tipo AS ENUM (
  'maquina_apagada',
  'sin_conexion_nayax',
  'tolva_atascada',
  'producto_compactado',
  'vandalismo',
  'falta_vasos',
  'producto_contaminado',
  'acceso_denegado',
  'queja_cliente',
  'cartucho_danado',
  'cartucho_perdido',
  'discrepancia_devolucion',
  'desviacion_calibracion',
  'otro'
);

CREATE TYPE incidencia_severidad AS ENUM ('baja','media','alta');

CREATE TYPE incidencia_estado AS ENUM ('abierta','en_revision','resuelta','descartada');

CREATE TYPE cierre_estado AS ENUM ('abierto','en_proceso','cerrado');

CREATE TYPE movimiento_tipo AS ENUM (
  'recepcion',
  'encartuchado_salida_granel',
  'encartuchado_entrada_cartucho',
  'merma_encartuchado',
  'surtido_salida_cartucho',
  'devolucion_entrada_cartucho',
  'llenado_salida_cartucho',
  'llenado_entrada_tolva',
  'venta_salida_tolva',
  'merma_ruta',
  'ajuste_conteo_almacen',
  'ajuste_conteo_maquina',
  'ajuste_periodo_anterior',
  'ajuste_manual'
);

CREATE TYPE mov_presentacion AS ENUM ('granel','cartucho','polvo_en_tolva','vaso');

CREATE TYPE calibracion_tipo AS ENUM ('preventiva_programada','correctiva_por_alerta','post_mantenimiento');

CREATE TYPE reporte_estado AS ENUM ('en_generacion','generado','aprobado','enviado','error');

CREATE TYPE alerta_tipo AS ENUM ('maquina_sin_venta_24h','discrepancia_pesaje_alta');

CREATE TYPE alerta_severidad AS ENUM ('info','warning','critical');

CREATE TYPE alerta_estado AS ENUM ('activa','atendida','descartada');
```

---

## Resumen de relaciones clave

Para tener una visión rápida de cómo se conectan los grupos:

### Flujo de compra → venta (cadena de custodia del producto)

```
proveedores
    │
    └─ presentaciones_proveedor ─┐
                                 │
                            ordenes_compra ─ oc_items
                                 │                │
                                 └─ recepciones ──┴─ recepcion_items
                                                       │
                                                    lotes ←─────────────┐
                                                       │                │
                                                       ▼                │
                                              encartuchados ─ encartuchado_lotes
                                                       │
                                                    surtidos ─ surtido_items
                                                       │
                                                    llenados ─ llenado_items
                                                       │           │
                                                       │      devoluciones_almacen
                                                       ▼
                                                    tolvas (inventario)
                                                       │
                                                    ventas_maquina (Nayax)
```

### Flujo organizativo (operador → ruta → máquina)

```
profiles (operador)
    │
    └─ rutas (titular)
          │
          └─ ruta_maquinas ─ maquinas ─ tolvas ─ planograma_historico
                              │
                         ubicaciones ─ clientes ─ contratos_cliente
                              │
                              └─ reportes_cliente

asignaciones_diarias ─ asignacion_maquinas
    │
    └─ jornadas ─ check_ins ─ llenados ─ incidencias
                                  │
                            pesajes_maquina (en cierre)
```

### Flujo de cierre mensual

```
cierres_mensuales
    │
    ├─ pesajes_maquina ─ pesaje_tolva_items
    │
    ├─ conteos_almacen ─┬─ conteo_granel_items
    │                   └─ conteo_cartuchos_items
    │
    └─ reportes_cliente (uno por cliente)
```

### Tabla transversal (todos los flujos escriben aquí)

```
movimientos_inventario  ←  triggers desde toda la cadena de inventario
audit_log               ←  triggers desde tablas sensibles
alertas                 ←  generadas por procesos automáticos
```

---

## Conteo final de objetos

| Categoría | Cantidad |
|---|---|
| Tablas | 43 |
| Tipos enumerados | 19 |
| Secuencias (folios) | 6 (OC, REC, ENC, SUR, INC + extensible) |
| Vistas materializadas (a definir en fase BI) | ~5-8 |

---

## Notas finales sobre implementación

1. **Orden de creación en migraciones**: respetar dependencias FK. El orden sugerido es:
   - Enums
   - Catálogos sin FK (proveedores, clientes, productos)
   - Catálogos con FK (presentaciones_proveedor, ubicaciones, maquinas, tolvas)
   - Identidad (profiles, user_roles, audit_log)
   - Configuración (config_global, contratos_cliente)
   - Rutas
   - Compras y recepción
   - Encartuchado
   - Surtido
   - Operación de campo
   - Cierre y conteos
   - Kardex
   - Ventas
   - Calibración
   - Reportes y alertas

2. **Triggers críticos a implementar**:
   - `updated_at` automático en tablas que lo tengan.
   - Cálculo de costo promedio en `tolvas` al insertar `llenado_items`.
   - Inserción en `movimientos_inventario` desde cada operación.
   - Generación de `devoluciones_almacen` automática al insertar `llenado_items` con `cartuchos_devolucion > 0`.
   - Auditoría en tablas sensibles.

3. **Funciones útiles a implementar**:
   - `auth.user_has_role(role app_role) returns boolean` para RLS.
   - `pick_lote_peps_granel(producto_id uuid, gramos_requeridos int)` retorna lista de lotes a consumir.
   - `pick_batch_peps_cartucho(producto_id uuid, cartuchos_requeridos int)` retorna lista de batches a consumir.
   - `calcular_sugerido_surtido(maquina_id uuid)` retorna lista de productos y cantidades sugeridas.
   - `cerrar_periodo(periodo_mes int, periodo_anio int)` valida pre-requisitos y cierra el periodo.

4. **RLS base por rol**: ver documento de diseño funcional. Aquí solo se modela la estructura de datos.

5. **Storage de Supabase**: buckets sugeridos:
   - `evidencias-checkin/`
   - `evidencias-llenado/`
   - `evidencias-pesaje/`
   - `evidencias-incidencias/`
   - `evidencias-calibracion/`
   - `reportes-cliente/`

---

*Fin del documento. Versión 2.0 — Modelo de datos consolidado para construcción.*
