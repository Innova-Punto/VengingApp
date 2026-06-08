# Manual del operador — MuscleUp / FitTaste

Guía paso a paso del flujo en campo: desde abrir la app hasta cerrar la última visita.

> Este documento es la versión textual del manual. La versión interactiva con capturas está en la app: abre `/campo/ayuda` (icono **?** en el header del móvil).

---

## 1. Antes de salir a ruta

### 1.1 Abre el link en tu celular

Abre el navegador (Chrome o Safari) y entra a la URL que te compartió tu supervisor.

Recomendamos guardar el link como acceso directo en la pantalla de inicio (en Chrome: menú → **Agregar a pantalla principal**).

### 1.2 Inicia sesión

Captura el correo y contraseña que te asignaron.

Si la contraseña no funciona, escríbele al supervisor antes de continuar (no la cambies tú mismo).

### 1.3 Permite GPS y cámara

La primera vez el celular te pedirá permitir ubicación (GPS) y cámara. **Acepta los dos**.

- Sin GPS no puedes hacer check-in.
- Sin cámara no puedes subir evidencia.

> 💡 **Tip**: Si por error denegaste el permiso, en Chrome ve a *ajustes del sitio* y permite ubicación y cámara.

---

## 2. Ver tu ruta del día

### 2.1 Pantalla principal: Hoy

Al entrar verás la tarjeta **Hoy** con la fecha y el número de asignaciones que tienes.

Abajo aparece cada ruta asignada con su color, nombre y cantidad de máquinas.

### 2.2 Estados de la ruta

| Estado | Significado |
|---|---|
| **Lista** | El almacén ya te entregó el surtido. Puedes salir a ruta. |
| **Sin surtir** | El surtido aún no se preparó. Avisa al planeador. |
| **En curso** | Ya iniciaste la jornada hoy. |
| **Completada** | Terminaste de visitar todas las máquinas. |

---

## 3. Iniciar la jornada

### 3.1 Tap en la ruta

Toca la tarjeta de la ruta que vas a hacer. Verás el detalle: lista de máquinas en el orden planeado.

### 3.2 Botón "Iniciar jornada"

Cuando estés a punto de salir, toca **Iniciar jornada**. Esto registra la hora de inicio y tu ubicación.

A partir de aquí ya puedes hacer check-in en cada máquina.

---

## 4. Visitar una máquina

> Repite estos pasos para cada máquina, en el orden que aparece en la lista.

### 4.1 Selecciona la máquina

Toca la máquina que vas a visitar. Si una no está en tu ruta original pero llegaste por excepción, pídele al planeador que la agregue.

### 4.2 Check-in (entrada)

Asegúrate de estar frente a la máquina. Toca **Check-in**.

- Toma la foto de la máquina (debe verse claramente el frente y el código de serie).
- El sistema valida tu ubicación contra la dirección registrada. Si la distancia es muy grande, te lo va a avisar.

> 💡 **Tip**: Si la máquina cambió de lugar físicamente, levanta una incidencia y avísale al planeador.

### 4.3 Pesaje (si la máquina lo requiere)

Algunas máquinas obligan a pesar las tolvas en cada visita (las que **no** tienen Nayax).

Para cada tolva:
1. Pesa el contenido actual (en gramos).
2. Captura el valor.

El sistema calcula automáticamente la diferencia contra el teórico (lo que debería haber) y la registra como merma o sobrante.

> 💡 **Tip**: Pesa **antes** de cargar. El número "gramos medidos" debe ser lo que hay en la tolva **antes** de echarle producto nuevo.

### 4.4 Llenado

Carga los cartuchos planeados en cada tolva.

- Si por algún motivo **no cargas todos los cartuchos planeados**, captura cuántos sí cargaste. Los que no cargues se contabilizan como devolución a almacén.
- Si la máquina lleva vasos, también captura cuántos vasos cargaste.

### 4.5 Reporta una incidencia (opcional)

Si encontraste algo raro: máquina con error, producto vencido, dispensador atorado, fuga, fraude, etc., toca **Reportar incidencia**.

- Selecciona el tipo.
- Captura una breve descripción.
- Toma foto.
- Para incidencias que afecten inventario (cartuchos dañados, robo), captura también la cantidad afectada.

### 4.6 Checkout (salida)

Antes de irte de la máquina, toca **Checkout**.

1. Toma la foto final de la máquina cerrada y con la lona/cristal limpio.
2. Marca el checklist:
   - **Nayax activo**: el terminal de pago funciona.
   - **Máquina limpia**: limpiaste el frente y el dispensador.
   - **100% productos activos**: todas las tolvas tienen producto disponible.

Si alguno está en NO, antes de checkout reporta la incidencia correspondiente.

> 💡 **Tip**: El checkout es **obligatorio** para cerrar la visita. Sin foto + checklist el sistema no te deja avanzar.

---

## 5. Cierre del día

### 5.1 Visitar la última máquina

Cuando termines la última máquina de la ruta y le des checkout, el sistema marca tu jornada como **completada** automáticamente.

### 5.2 Devolución de cartuchos no usados

Cuando regreses al almacén, entrega los cartuchos que no cargaste.

El sistema ya generó la lista de devolución automáticamente con base en lo que reportaste en llenado. El almacén te confirmará la recepción.

### 5.3 Cerrar sesión

Toca tu nombre en la esquina superior y luego **Salir**.

Si vas a usar el mismo celular al día siguiente, no es necesario cerrar sesión.

---

## Consejos generales

### ✓ Antes de salir

- Revisa que el celular tenga batería ≥ 70% o lleva cargador.
- Verifica que los cartuchos del surtido estén completos.
- Lleva una toalla para limpiar y la balanza si tu ruta tiene máquinas con pesaje obligatorio.

### ✓ En ruta

- Sigue el orden de la ruta. Si necesitas cambiarlo, avísale antes al supervisor.
- No saltes ningún paso del flujo (check-in → pesaje → llenado → checkout). El sistema audita todo.
- Si hay problemas con la app, escríbele al supervisor con captura de pantalla.

### ✓ Si no tienes internet

- El sistema requiere conexión. Si pierdes señal momentáneamente: espera un par de minutos y reintenta.
- Si la zona no tiene cobertura, anota manualmente lo que hiciste y captura en la app cuando recuperes señal (lo más pronto posible — el GPS y la hora se registran al momento del envío).

---

## Resumen visual del flujo

```
Login
  ↓
Permite GPS y cámara
  ↓
Pantalla "Hoy" → ver asignaciones
  ↓
Tap en ruta del día → Iniciar jornada
  ↓
┌─────────────────────────────────┐
│  Por cada máquina:              │
│    1. Check-in (foto + GPS)     │
│    2. Pesaje (si aplica)        │
│    3. Llenado (cartuchos+vasos) │
│    4. Incidencia (si aplica)    │
│    5. Checkout (foto+checklist) │
└─────────────────────────────────┘
  ↓
Última máquina → ruta Completada
  ↓
Almacén → entrega devolución
  ↓
Salir
```

---

*Versión 1 — Junio 2026. Si encuentras un paso confuso o falta algo, avísale a tu supervisor para actualizar este manual.*
