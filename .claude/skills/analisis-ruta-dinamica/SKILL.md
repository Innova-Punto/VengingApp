---
name: analisis-ruta-dinamica
description: >-
  Genera el análisis de cómo salió la operación con el agente de ruteo en un
  rango de días: productividad por operador (paradas hechas contra planeadas,
  kilómetros, hora de arranque y de cierre, minutos por parada), productividad
  del planeador (cuánto tardó Mariana en decidir la propuesta y en surtir),
  agua (mediciones, litros de almacén contra comprados en tienda, máquinas que
  se quedaron cortas), quejas e incidencias cruzadas contra quién sí recibió
  visita, ventas, máquinas sin vender y cobertura del parque. Úsalo SIEMPRE que
  pregunten cómo fue la ruta dinámica, cómo les fue a los operadores, si el
  agente de ruteo está funcionando, cuántas paradas se cumplieron, por qué no
  se cerró la jornada, cuánta agua se cargó o quién no la cargó — aunque no
  digan "análisis" ni "ruta dinámica" (ej. "¿cómo nos fue esta semana?",
  "¿Jorge por qué solo hizo 5 paradas?", "¿el agente está sirviendo?",
  "recopilación de los primeros días"). También aplica a días de ruta fija, que
  sirven de comparación.
---

# Análisis de la ruta dinámica

Este análisis existe para responder una pregunta: **¿el agente de ruteo está
mejorando la operación, y dónde se está atorando?** Todo lo demás es evidencia
para esa pregunta.

Casi todo el trabajo son consultas que ya están escritas en
`references/consultas.sql`. Léelo cuando vayas a correr cada bloque; no las
reescribas de memoria, porque varias tienen detalles que cuestan caro si se
pierden (los nombres de columna del esquema no son los obvios, y el cálculo de
kilómetros depende del orden real de visita).

El proyecto de Supabase es `opncevovlgcblwlztqck`. Todo se corre con
`execute_sql` — este análisis **solo lee**, nunca escribe.

## Antes de empezar: acuerda el rango

Pregunta qué días, si no te los dieron. Y fija el **rango de comparación** en
el mismo momento, porque es donde se cometen los errores de lectura:

- Compara **mismos días de la semana**. Un miércoles-jueves-viernes contra otro
  miércoles-jueves-viernes. Los fines de semana en gimnasios venden la mitad y
  arruinan cualquier promedio.
- Compara contra **dos semanas previas, no una**. Esto no es exceso de rigor:
  en el primer análisis de noviembre, la semana anterior resultó ser un pico, y
  mirarla sola habría dicho "la ruta dinámica tiró la venta 12%" cuando contra
  dos semanas antes estaba idéntica (953 contra 955 bebidas). Una sola ventana
  de comparación convierte el ruido semanal en una conclusión falsa.

## Las seis dimensiones

Córrelas en este orden. Cada una está en su bloque de `consultas.sql`.

### 1. Cumplimiento: planeado contra hecho

Paradas planeadas y visitadas por operador y día, el estado en que cerró la
jornada y las notas de la propuesta.

Antes de culpar al agente por un cumplimiento bajo, **compara el porcentaje
cumplido contra el porcentaje de jornada trabajada**. Si hicieron el 75% de las
paradas y trabajaron 6.3 de 8 horas (78%), la jornada corta explica casi todo y
el plan no estaba mal dimensionado. Esa descomposición es la diferencia entre
"hay que recalibrar el agente" y "hay que salir más temprano", y son acciones
completamente distintas.

### 2. Productividad por operador

Paradas, kilómetros, arranque, cierre, horas y minutos por parada.

Los **kilómetros se calculan sobre la secuencia real de visita**, con las
coordenadas de las ubicaciones, no con los km que traía el plan. El plan dice
lo que el agente imaginó; nos interesa lo que de verdad recorrieron. No incluye
los tramos desde y hacia el CEDIS, que no se registran — dilo cuando presentes
la cifra.

Mira la hora de arranque con atención. Es el hallazgo más repetido y el más
barato de corregir.

### 3. Productividad del planeador

Cuándo entregó el agente, cuánto tardó Mariana en decidir, cuándo quedaron los
surtidos y cuántos minutos le llevó cada uno.

El número que importa no es cuánto tarda ella —suele ser de 2 a 8 minutos por
surtido— sino **el hueco entre que el surtido queda listo y el primer check-in
del día**. Ahí es donde se pierde la hora y media.

Si el tiempo de decisión baja de un día a otro, dilo: es la señal más directa
de que está confiando en la herramienta.

### 4. Agua

Tres cosas distintas, no las mezcles:

- **¿Midieron?** Cada visita debería dejar una medición. Si falta, el teórico
  de esa máquina se degrada en silencio.
- **¿De dónde salió el litro?** `origen = 'almacen'` es el garrafón del CEDIS;
  `compra_operador` es el de la tienda, que sale mucho más caro. Reporta el
  porcentaje de cada uno — es un costo que hoy nadie suma.
- **¿Quién se quedó corta?** Las máquinas que el agente marcó con agua baja y
  no recibieron litros. Síguele la pista a las que aparecen **varios días
  seguidos bajando**: ése es el patrón que termina en tanque vacío, y una
  máquina sin agua no vende nada.

### 5. Quejas e incidencias

Lista las quejas del periodo **cruzadas contra si la máquina recibió visita**.
Una queja en una máquina que nadie visitó dice algo muy distinto de una queja
que llega el día después de que estuvieron ahí: la segunda significa que la
visita no resolvió el problema.

Cuenta aparte las **técnicas** (`quejas_tecnicas_30d`), que son las que delatan
un componente descompuesto y no las arregla un resurtido.

### 6. Ventas, máquinas sin vender y cobertura

Venta diaria del periodo contra las dos ventanas de comparación, máquinas que
no vendieron nada cada día, y cuántas máquinas distintas se visitaron.

La métrica que mejor mide al agente es **cartuchos entregados por visita**: si
sube contra la ruta fija, está mandando a la gente donde sí hace falta
producto. Acompáñala de las **visitas que no cargaron nada** —ni polvo, ni
vasos, ni agua—, que son el viaje desperdiciado.

Cierra con las máquinas que nadie pisó en el periodo y cuántas de ésas ya traen
visita vencida.

## Trampas que ya nos costaron caro

**Las máquinas `tipo = 'servicio'` no venden.** Exclúyelas de cualquier métrica
de venta o se vuelven falsas alarmas permanentes. Pero sí cuentan como visita:
son las Smart Energy, van pegadas a su hermana de sitio.

**Una visita larguísima puede ser trabajo real, no un error de captura.**
Encontramos una de 266 minutos y la descartamos como "check-out olvidado". Era
el supervisor pasando 4.4 horas reviviendo una máquina que llevaba dos semanas
muerta — y lo logró. Antes de descartar un dato raro, ve qué pasó con esa
máquina después.

**Para sumar una jornada usa el promedio, no la mediana.** La distribución de
tiempos está sesgada a la derecha (promedio 32.7, mediana 25.6, p90 60.7).
Planear con la mediana vuelve a dejar el día corto.

**Una ruta cancelada casi siempre tiene una razón operativa que no está en la
base.** Instalaciones, permisos, alguien enfermo. Antes de concluir que el
planeador descartó el plan del agente, pregunta. El motivo solo se captura al
descartar la propuesta completa, no al cancelar una ruta suelta.

**El agente ve lo que le damos.** Si una máquina no subió en la ruta, revisa
primero qué traía en `estado_entrada` de esa propuesta —está guardado— antes de
concluir que el agente la ignoró. En noviembre resultó que sí veía las quejas
de Delta; lo que estaba roto era el indicador que las clasificaba.

## Cómo entregarlo

Si el análisis es para circularse o para que alguien lo recopile, va en un
documento, no en el chat. Si es una pregunta suelta, contesta en el chat.

Estructura que funciona:

```
# Ruta dinámica · <rango>
<fecha> · <autor>

<Una frase con la respuesta: qué funcionó y qué no, con sus dos números.>

## Qué funcionó
## Qué no funcionó
## Productividad por operador      (tabla por día)
## Productividad del planeador     (tabla por día)
## Agua
## Quejas e incidencias            (tabla de quejas con la columna "¿la visitaron?")
## Ventas y máquinas sin vender
## Qué cambiar, en orden de rendimiento
```

Las recomendaciones van **ordenadas por rendimiento, no por facilidad**, y cada
una dice qué cuesta. Separa lo que es cambio de parámetro de lo que es
conversación con una persona: suelen ser las dos cosas y se resuelven distinto.

Y cuando los tres días no alcancen para separar dos causas, dilo. Es más útil
que una conclusión que no se sostiene.
