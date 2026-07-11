# Guía: dar de alta productos nuevos y conectarlos con Nayax

> Para: Mariana (compras / catálogos).
> Objetivo: agregar productos nuevos (Smart Fit / Planet Fitness), su proveedor y
> presentación, ponerlos en las máquinas y **asegurar que las ventas de Nayax
> caigan bien**.

---

## 0. El orden correcto (resumen)

Sigue este orden; cada paso depende del anterior:

1. **Proveedor** (si es nuevo).
2. **Producto** (SKU, tipo, cliente).
3. **Presentación** del proveedor para ese producto (con el **costo**).
4. **Compra y recepción** (para que entre a almacén con inventario y costo).
5. **Ponerlo en la máquina** (planograma o receta) **con su código Nayax**.
6. **Verificar el match con Nayax** (lo más importante).

> Regla de oro del costo: el **costo unitario se captura SIN IVA** (el IVA se
> suma aparte). De ahí sale el costo por gramo con el que se valúa todo.

---

## 1. Dar de alta un proveedor (si es nuevo)

**Menú: Catálogos → Proveedores → “Nuevo proveedor”.**

- Nombre, datos de contacto y días de crédito.
- Si el proveedor ya existe, sáltate este paso.

---

## 2. Dar de alta el producto

**Menú: Catálogos → Productos → “Nuevo producto”.**

Campos clave:

| Campo | Qué poner |
|---|---|
| **SKU** | Código único interno (ej. `OWF-002`). No se repite. |
| **Nombre** | Nombre visible (ej. `211 BRD PERF VAINILLA`). |
| **Tipo** | `polvo` (proteína/café) o `vaso`. |
| **Cliente exclusivo** | **Smart Fit** o **Planet Fitness** (¡importante! así se atribuye en reportes y cierre). |
| **Gramaje de servicio** | Gramos que dispensa por venta (ej. 30 g). |
| **Gramaje por cartucho** | Gramos por cartucho (proteínas suelen ser 400 g). |
| **Precio de venta** | Precio al público (con IVA) sugerido. |
| **¿Requiere encartuchado?** | **Sí** si se encartucha en casa (proteínas). **No** si viene pre-empacado del proveedor (ej. café en bolsa de 1 kg → se auto-encartucha al recibir). |
| **Capacidad por tolva** | Capacidad máxima de la tolva para ese producto (ej. 1200 g). |

---

## 3. Establecer la presentación del proveedor

La **presentación** conecta *producto ↔ proveedor* y define el **costo**.

**Menú: Catálogos → Proveedores → abre el proveedor → “Agregar presentación”.**

| Campo | Qué poner |
|---|---|
| **Producto** | El que acabas de crear. |
| **Nombre presentación** | Cómo lo vende el proveedor (ej. `1.9 KG`, `Bolsa 1 kg`, `Gramo`). |
| **Peso neto (g)** | Gramos que trae esa presentación (ej. 1900). |
| **Unidades por presentación** | Normalmente 1 (para vasos, las piezas por caja). |
| **Costo unitario** | **SIN IVA.** Acepta hasta **6 decimales** (útil para costos por gramo, ej. `0.614874`). |
| **IVA (tasa)** | Normalmente `0.16`. Se suma aparte, no va dentro del costo. |

> El sistema calcula solo: **costo por gramo = costo unitario ÷ peso neto**.

---

## 4. Comprar y recibir (para que entre a almacén)

Para que el producto tenga **inventario y costo real**:

1. **Compras → Órdenes de compra → Nueva OC** al proveedor, agregando el producto (elige su presentación y captura la cantidad y el costo).
2. **Almacén → Recepciones → Nueva recepción** contra esa OC, capturando lo recibido.
   - Al recibir se crea el **lote** con su costo por gramo (SIN IVA) y, si el producto “requiere encartuchado”, se encartucha; si no, se auto-encartucha.

---

## 5. Poner el producto en la máquina (¡y su código Nayax!)

Aquí hay **dos tipos de máquina**. Identifica cuál es antes de continuar.

### 5A. Máquinas de proteína (tipo `polvo directo`) — Smart Fit

Cada **tolva** vende **un producto directo**.

**Menú: Catálogos → Máquinas → abre la máquina → edita el planograma (tolvas).**

Por cada tolva donde pondrás el producto:

| Campo | Qué poner |
|---|---|
| **Producto** | El producto de esa tolva. |
| **Gramaje de servicio** | Gramos por venta. |
| **Precio de venta** | Precio al público. |
| **Código Nayax (item code)** | 🔴 **El número de selección que Nayax reporta para esa posición** (ver sección 6). |
| **Capacidad (override)** | Opcional, si difiere del default. |

### 5B. Máquinas de café (tipo `preparado`) — Planet Fitness

Aquí las tolvas son **ingredientes** (café, leche, chocolate…) y lo que se vende son **bebidas = recetas**.

- Primero pon los **ingredientes** en las tolvas (igual que 5A, pero sin código Nayax en la tolva; el ingrediente no se vende solo).
- Luego crea/edita las **bebidas**: **Catálogos → Recetas → abre la máquina/receta.**
  Cada bebida lleva: **nombre**, **precio**, **código Nayax (item code)** 🔴 y sus **ingredientes** (qué tolva y cuántos gramos).

---

## 6. 🔴 Lo más importante: el match con Nayax

Para que una venta de Nayax se procese y descuente inventario, **dos cosas deben coincidir exactamente**:

1. **ID de la máquina**: el campo **`nayax_machine_id`** de la máquina (en Catálogos → Máquinas → editar) debe ser **igual** al *MachineId* que manda Nayax.
2. **Código del producto (PA Code)**: el **código Nayax (item code)** que capturaste
   - en la **tolva** (máquinas de proteína), o
   - en la **receta/bebida** (máquinas de café),

   debe ser **idéntico** al **“Product PA Code”** que Nayax envía para esa selección. Es el número de posición/selección configurado **en la máquina Nayax** (lo ves en el portal de Nayax o en la config de la botonera).

> Si el código no coincide, la venta **NO se procesa**: se queda con error y el
> inventario **no se descuenta**. No falla “a medias”, simplemente no entra.

### Cómo asegurarlo
- Consigue el **PA Code** de cada selección desde el **portal de Nayax** (o la
  hoja de configuración de la máquina).
- Captura en nuestra app **exactamente el mismo valor** (mismos dígitos, sin
  espacios). Ej.: si Nayax manda PA Code `4`, aquí debe decir `4`.

### Cómo verificar que quedó bien
1. Haz una **venta de prueba** en la máquina (o espera la primera venta real).
2. Entra a **Admin → Nayax**:
   - Si aparece en **“Últimas ventas”** con la máquina y producto correctos → ✅ **el match está bien**.
   - Si ves error tipo **“PA Code X no encontrado”** en **Sync log / Errores**, o el mensaje cae en **“Mensajes descartados”** → ❌ el código **no coincide**; corrige el item code y vuelve a probar.

---

## ✅ Checklist para cada producto nuevo

- [ ] Proveedor dado de alta (si es nuevo).
- [ ] Producto creado con **SKU**, **tipo** y **cliente** (Smart Fit / Planet) correctos.
- [ ] Presentación del proveedor con **costo SIN IVA**.
- [ ] OC + recepción hechas (ya tiene inventario y costo).
- [ ] Producto puesto en la(s) máquina(s): tolva (proteína) o receta (café).
- [ ] **Código Nayax capturado = PA Code de Nayax** (mismo valor).
- [ ] **`nayax_machine_id`** de la máquina correcto.
- [ ] **Verificado en Admin → Nayax**: la venta de prueba entró sin error.

---

## 🛠️ Si algo no cuadra

| Síntoma | Causa probable | Solución |
|---|---|---|
| La venta no aparece y hay error **“PA Code no encontrado”** | El item code no coincide con el de Nayax | Corrige el **código Nayax** en la tolva/receta para que sea idéntico al PA Code. |
| Error **“Máquina … no encontrada”** | `nayax_machine_id` mal o vacío | Corrige el `nayax_machine_id` de la máquina. |
| La venta entra pero **sin producto/costo** | Falta el producto en la tolva o la receta | Completa el planograma / la receta. |
| El inventario no baja | Alguna de las anteriores (la venta no se procesó) | Revisa **Admin → Nayax → Sync log / Descartados** y corrige. |

> Regla práctica: **primero configura todo en la app, luego haz una venta de
> prueba y confírmala en Admin → Nayax.** Si entra sin error, quedó listo.
