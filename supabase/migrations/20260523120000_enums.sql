-- ============================================================================
-- 00 · Tipos enumerados (ENUMs)
-- 19 tipos que se usan en todo el modelo. Crear ANTES que cualquier tabla.
-- ============================================================================

create extension if not exists pgcrypto;

create type app_role as enum ('direccion','compras','almacen','planeador','operador','admin');

create type producto_tipo as enum ('polvo','vaso');

create type contrato_tipo as enum ('renta_fija','revenue_share','mixto');

create type maquina_estado as enum ('operativa','mantenimiento','baja');

create type asignacion_estado as enum ('planeada','surtida','en_jornada','completada','cancelada');

create type excepcion_motivo as enum ('ausencia_operador','emergencia','mantenimiento','otro');

create type oc_estado as enum ('borrador','enviada','parcial','recibida','cancelada');

create type surtido_estado as enum ('pendiente','en_proceso','completado');

create type checkin_metodo as enum ('gps','qr','manual_supervisado');

create type devolucion_estado as enum ('pendiente_devolucion','recibida_ok','recibida_con_diferencia');

create type incidencia_tipo as enum (
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

create type incidencia_severidad as enum ('baja','media','alta');

create type incidencia_estado as enum ('abierta','en_revision','resuelta','descartada');

create type cierre_estado as enum ('abierto','en_proceso','cerrado');

create type movimiento_tipo as enum (
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

create type mov_presentacion as enum ('granel','cartucho','polvo_en_tolva','vaso');

create type calibracion_tipo as enum ('preventiva_programada','correctiva_por_alerta','post_mantenimiento');

create type reporte_estado as enum ('en_generacion','generado','aprobado','enviado','error');

create type alerta_tipo as enum ('maquina_sin_venta_24h','discrepancia_pesaje_alta');

create type alerta_severidad as enum ('info','warning','critical');

create type alerta_estado as enum ('activa','atendida','descartada');
