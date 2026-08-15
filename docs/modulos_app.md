# Mapa funcional de la app — MuscleUp / VendingApp

**Actualizado 14-ago-2026.** Qué hace cada módulo, quién entra, qué pantallas tiene y qué
reglas de negocio aplica. Complemento de `muscleup_modelo_datos.md` (las tablas) y de
`CLAUDE.md` (las convenciones).

## Ciclo de negocio

```
Compra → Recepción → Encartuchado → Planeación → Surtido → Operación en campo
       → Pesaje → Cierre mensual → BI/Reportes
```

## Estructura de rutas

| Grupo | Ruta base | Quién entra |
|---|---|---|
| Auth | `/login`, `/set-password` | público |
| Catálogos | `/admin/*` | admin, dirección, compras, planeador |
| Compras | `/compras/*` | admin, dirección, compras |
| Almacén | `/almacen/*` | admin, dirección, almacén, compras |
| Planeación | `/planeacion/*` | admin, dirección, planeador, almacén |
| Campo (PWA) | `/campo/*` | operador, admin, dirección |
| Dirección/BI | `/admin/*` | admin, dirección |

El acceso se valida **en cada página** con `requireRole(...)` (`src/lib/auth.ts`) y **otra vez**
en la base con RLS. La navegación (`src/app/(authenticated)/layout.tsx`) solo oculta enlaces.

---

## 1. Catálogos

| Pantalla | Ruta | Notas |
|---|---|---|
| Productos | `/admin/productos` | SKU, tipo (polvo/vaso), gramajes default, PA codes Nayax, stock min/máx, exclusividad por cliente |
| Proveedores | `/admin/proveedores` | + **presentaciones** (la unidad comprable: peso neto, costo, IVA, moneda) |
| Clientes | `/admin/clientes` | + **ubicaciones** con GPS, geofence y **horario de operación** |
| Máquinas | `/admin/maquinas` | serie, alias, tipo, Nayax ID, frecuencia de visita, tolvas, producto de vaso |
| Recetas | `/admin/recetas` | bebidas compuestas (Planet Fitness): 1 PA code → N ingredientes |
| Planogramas | `/admin/planogramas` | plantillas de tolvas reutilizables; cada aplicación versiona el histórico |
| Rutas | `/admin/rutas` | zona + operador titular + orden de máquinas |
| Usuarios | `/admin/usuarios` | alta por invitación, asignación de roles |

**Reglas clave**
- Las tolvas se crean solas al dar de alta la máquina (según `num_tolvas`).
- Cambiar el producto/gramaje/precio de una tolva **versiona** el cambio en `planograma_historico`.
- Los PA codes de Nayax no pueden repetirse entre productos (trigger de validación).
- Cambiar el `tipo` de una máquina limpia la configuración incompatible (recetas o PA codes).

---

## 2. Compras

**Pantallas**: `/compras/ordenes`, `/compras/ordenes/nuevo`, `/compras/ordenes/[id]`

Flujo: `borrador` → (agregar items) → **enviada** → recepción(es) → `parcial` → `recibida`.
Solo se editan items en `borrador`. `cerrarOcIncompleta` permite cerrar con faltantes dejando motivo.

### OC en pesos (flujo estándar)
Se elige presentación + cantidad + costo unitario. Casilla "el costo incluye IVA" para
desglosarlo al guardar. Los totales los recalcula un trigger.

### OC en dólares (ago-2026)
Porque el proveedor cotiza en USD y se paga 50% anticipo + 50% liquidación con TC distinto:

1. Al crear la OC se elige moneda **USD** y un **TC provisional**.
2. Los items se capturan **en dólares**; el MXN lo calcula el sistema (nadie teclea MXN).
3. La recepción queda **bloqueada** (botón deshabilitado + trigger en BD) hasta que compras
   capture el **TC real ponderado** y lo confirme.
4. Al confirmar, se recalculan todos los costos MXN y totales. Tras la primera recepción el
   **TC se congela**.

> Los pagos y cuentas por pagar viven en la app de tesorería. Aquí solo entra el TC final.

---

## 3. Almacén

| Pantalla | Ruta | Qué hace |
|---|---|---|
| Inventario | `/almacen/inventario` | posición consolidada por producto: granel, cartuchos, vasos, en máquinas, **costo y valor total** |
| Recepciones | `/almacen/recepciones` | recibe contra OC; **crea lotes** con su costo por gramo |
| Lotes | `/almacen/lotes` | trazabilidad: caducidad, disponible, costo |
| Encartuchado | `/almacen/encartuchados` | granel → cartuchos, consumo PEPS, merma y costo ponderado |
| Devoluciones | `/almacen/devoluciones` | cartuchos que el operador no cargó; concilia lo que regresa |
| Conteos | `/almacen/conteos` | conteo físico (granel, cartuchos, vasos) → ajustes al kardex |

**Reglas clave**
- Todo consumo de granel/cartuchos/vasos es **PEPS**.
- Las devoluciones se generan **automáticamente** al registrar el llenado; si lo recibido no
  cuadra con lo calculado, se levanta incidencia.
- Los conteos aplican asientos `ajuste_conteo_almacen` (nunca editan el histórico).

---

## 4. Planeación

| Pantalla | Ruta | Qué hace |
|---|---|---|
| Salud de máquinas | `/planeacion/salud-maquinas` | venta de ayer vs. promedio, **horas sin venta en operación**, banner de máquinas a revisar y **mapa vivo** |
| Asignaciones | `/planeacion/asignaciones` | calendario de qué ruta visita cada operador |
| **Asignación dinámica** | `/planeacion/asignaciones/dinamica` | propuesta por prioridad (ago-2026) |
| Emergencias | `/planeacion/emergencias` | ruta fuera de calendario o máquina con falla |
| Surtidos | `/planeacion/surtidos` | sugerido de carga + packing list imprimible |

### Modo estático (el de siempre)
"Nueva asignación" → ruta + operador + fecha → copia las máquinas base de la ruta.

### Modo dinámico (ago-2026)
**El sistema propone, planeación dispone.** Cada operador conserva su zona; lo que cambia es
qué paradas visita hoy:

1. Elegir fecha y cap de paradas (default 11).
2. El sistema arma una tarjeta por operador con sus paradas más prioritarias
   (revisión > crítica > alta > visita vencida > media > baja > relleno), cada máquina con su
   motivo legible ("tolva a 3.3 días", "12 h sin venta — revisión", "8 días sin visita").
3. La unidad es la **parada (ubicación)**: donde hay máquina nutri + Smart Energy, ambas van
   en el mismo viaje y la Energy no consume lugar del cap.
4. Se muestra el **overflow** de urgentes que no cupieron (con liga a emergencias) y avisos de
   rutas ya asignadas ese día.
5. Al confirmar se crean asignaciones **idénticas** a las del modo estático, marcadas con
   `origen = 'sugerencia_dinamica'` (KPI para comparar contra el modo estático).

### Mapa vivo
Leaflet + OpenStreetMap (sin API key). Pin por máquina coloreado con el semáforo del score:
morado = revisión · rojo = crítica · naranja = alta · amarillo = media · gris = ok.
Respeta los filtros de ruta/operador de la página.

### Surtido
El sugeridor calcula cartuchos y vasos por máquina según hueco en tolva y consumo. Almacén
ajusta lo real entregado y completa el surtido → descuenta inventario por PEPS (idempotente)
y la asignación pasa a `surtida`. Cancelar una ruta surtida **reintegra** el inventario.

> Una máquina de **servicio** nunca genera surtido: su asignación puede arrancar jornada
> directamente en estado `planeada`.

---

## 5. Operación en campo — PWA del operador

Ruta base `/campo` (móvil primero). El operador ve solo su día.

```
/campo                  → asignaciones de hoy
/campo/jornada/[id]     → iniciar jornada + lista de máquinas
/campo/maquinas/[id]    → la visita completa
/campo/ayuda            → manual con capturas
```

### Visita a máquina normal (nutri)
1. **Check-in** con GPS (o manual supervisado) + foto opcional.
2. **Pesaje** si aplica: primera vez de la máquina, hay cierre mensual abierto, o
   `requiere_pesaje`. Bloquea el resto hasta capturarlo.
3. **Llenado**: cartuchos por tolva + vasos. Lo no cargado genera devolución automática.
4. **Checkout obligatorio**: 3 preguntas sí/no (Nayax activo, máquina limpia, productos
   activos) + foto de salida opcional.
5. **Incidencias** en cualquier momento (con foto).

### Visita a máquina de servicio (Smart Energy)
Tras el check-in aparece el **checklist de servicio** en lugar del flujo de llenado:

- 31 puntos en 6 secciones: Bien / Mal / N/A. Los "Mal" exigen descripción (foto opcional).
- Inventario S/F que da el cliente, reposición de producto (piezas), foto general y
  observaciones.
- **Firma del líder del sitio** en pantalla (canvas), o marcar que no está disponible con motivo.
- Al finalizar se genera folio `SRV-` y se cierra la visita.

**Nota de robustez**: fotos y firma se suben **desde el navegador directo a Storage** (con
compresión y reintentos) para que una señal débil no tumbe el Server Action.

---

## 6. Dirección / BI

| Pantalla | Ruta | Para qué |
|---|---|---|
| Dashboard | `/admin/dashboard` | venta del día/mes, cascada de IVA, márgenes, alertas |
| Ventas | `/admin/ventas` | detalle de transacciones Nayax |
| Ventas intercompany | `/admin/ventas-intercompany` | venta de inventario a empresas del grupo |
| Cierres mensuales | `/admin/cierres` | apertura/cierre, estado de resultados global y **por cliente** |
| Jornadas (auditoría) | `/admin/jornadas` | recorrido completo del operador con evidencias |
| Dashboard supervisión | `/admin/supervision` | cumplimiento de ruta y tiempos |
| Health checks | `/admin/supervision/health` | integridad de datos |
| Incidencias | `/admin/incidencias` | + análisis por máquina y autorización de mermas |
| Errores operativos | `/admin/errores-operativos` | fallas de proceso atribuibles a operación |
| **Servicios** | `/admin/servicios` | historial de visitas Smart Energy con checklist, evidencias y firma |
| Nayax | `/admin/nayax` | sincronización, errores y mensajes descartados |
| Pesajes | `/admin/pesajes/[id]` | corrección de pesajes con rastro |

### Auditoría de jornada
Cada visita muestra: check-in con GPS y mapa, evidencias, llenado por tolva, pesaje con
desviaciones, incidencias y —en máquinas de servicio— el bloque completo del servicio
(folio, checklist, fallas con foto, producto repuesto, foto general y **firma del líder**).

### Cierre mensual
Ventana encadenada (inicio = fin del mes anterior). Incluye conteo de almacén, pesajes de
máquinas, y produce el estado de resultados con la cascada de IVA, global y por cliente.

---

## 7. Integración Nayax

- Ingesta idempotente por `nayax_transaction_id` (`procesar_venta_nayax`).
- Mapea `nayax_machine_id` + PA code → máquina/tolva/producto. Las bebidas por receta se
  descomponen en ingredientes.
- Lo que no mapea cae en `nayax_mensajes_descartados` (visible en `/admin/nayax/descartados`).
- Nayax entrega **UTC**; todos los cortes de negocio se calculan en **CDMX**.
- Las máquinas de **servicio** no tienen venta Nayax por diseño: están excluidas de los
  reportes de venta y de la alerta de máquina muda.

---

## 8. Alertas automáticas

| Alerta | Origen | Cuándo |
|---|---|---|
| `maquina_sin_venta_12h` | cron horario | ≥12 h sin vender en horario de operación |
| `surtido_salida_duplicada` | cron horario | posible doble descuento de inventario |
| `checkin_sin_llenado` | cierre de fin de día | visita sin llenado ni servicio registrado |
| `discrepancia_pesaje_alta` | pesaje | desviación fuera de umbral |

---

## 9. Convenciones de UI

- **Server Components** por default; `"use client"` solo con interactividad real.
- Mutaciones vía **Server Actions** con `requireRole` al inicio.
- Tailwind + shadcn/ui (`new-york`, base `zinc`). Estados con badges de color consistentes:
  rojo crítico · ámbar advertencia · verde ok · morado revisión.
- Fechas siempre con los helpers de `src/lib/datetime.ts` (CDMX).
- Montos en MXN con 2 decimales; gramos como enteros con separador de miles.
