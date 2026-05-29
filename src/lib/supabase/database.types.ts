export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alertas: {
        Row: {
          atendida_por: string | null
          canales_envio: string[] | null
          created_at: string
          datos_jsonb: Json | null
          estado: Database["public"]["Enums"]["alerta_estado"]
          fecha_apertura: string
          fecha_cierre: string | null
          id: string
          maquina_id: string | null
          mensaje: string
          notas_resolucion: string | null
          notificada_a: string[] | null
          severidad: Database["public"]["Enums"]["alerta_severidad"]
          tipo: Database["public"]["Enums"]["alerta_tipo"]
          tolva_id: string | null
        }
        Insert: {
          atendida_por?: string | null
          canales_envio?: string[] | null
          created_at?: string
          datos_jsonb?: Json | null
          estado?: Database["public"]["Enums"]["alerta_estado"]
          fecha_apertura?: string
          fecha_cierre?: string | null
          id?: string
          maquina_id?: string | null
          mensaje: string
          notas_resolucion?: string | null
          notificada_a?: string[] | null
          severidad?: Database["public"]["Enums"]["alerta_severidad"]
          tipo: Database["public"]["Enums"]["alerta_tipo"]
          tolva_id?: string | null
        }
        Update: {
          atendida_por?: string | null
          canales_envio?: string[] | null
          created_at?: string
          datos_jsonb?: Json | null
          estado?: Database["public"]["Enums"]["alerta_estado"]
          fecha_apertura?: string
          fecha_cierre?: string | null
          id?: string
          maquina_id?: string | null
          mensaje?: string
          notas_resolucion?: string | null
          notificada_a?: string[] | null
          severidad?: Database["public"]["Enums"]["alerta_severidad"]
          tipo?: Database["public"]["Enums"]["alerta_tipo"]
          tolva_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_atendida_por_fkey"
            columns: ["atendida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_tolva_id_fkey"
            columns: ["tolva_id"]
            isOneToOne: false
            referencedRelation: "tolvas"
            referencedColumns: ["id"]
          },
        ]
      }
      asignacion_maquinas: {
        Row: {
          asignacion_id: string
          created_at: string
          id: string
          maquina_id: string
          motivo_excepcion:
            | Database["public"]["Enums"]["excepcion_motivo"]
            | null
          notas: string | null
          orden: number
          origen: string
        }
        Insert: {
          asignacion_id: string
          created_at?: string
          id?: string
          maquina_id: string
          motivo_excepcion?:
            | Database["public"]["Enums"]["excepcion_motivo"]
            | null
          notas?: string | null
          orden?: number
          origen: string
        }
        Update: {
          asignacion_id?: string
          created_at?: string
          id?: string
          maquina_id?: string
          motivo_excepcion?:
            | Database["public"]["Enums"]["excepcion_motivo"]
            | null
          notas?: string | null
          orden?: number
          origen?: string
        }
        Relationships: [
          {
            foreignKeyName: "asignacion_maquinas_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "asignaciones_diarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignacion_maquinas_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
        ]
      }
      asignaciones_diarias: {
        Row: {
          creado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["asignacion_estado"]
          fecha: string
          id: string
          notas: string | null
          operador_id: string
          ruta_id: string
          updated_at: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["asignacion_estado"]
          fecha: string
          id?: string
          notas?: string | null
          operador_id: string
          ruta_id: string
          updated_at?: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["asignacion_estado"]
          fecha?: string
          id?: string
          notas?: string | null
          operador_id?: string
          ruta_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asignaciones_diarias_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_diarias_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_diarias_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          accion: string
          diff_jsonb: Json | null
          fecha: string
          id: string
          ip_address: unknown
          registro_id: string
          tabla: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accion: string
          diff_jsonb?: Json | null
          fecha?: string
          id?: string
          ip_address?: unknown
          registro_id: string
          tabla: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accion?: string
          diff_jsonb?: Json | null
          fecha?: string
          id?: string
          ip_address?: unknown
          registro_id?: string
          tabla?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calibraciones_maquina: {
        Row: {
          ajuste_aplicado: boolean
          alerta_origen_id: string | null
          created_at: string
          descripcion_ajuste: string | null
          desviacion_porcentaje: number | null
          fecha: string
          foto_url: string | null
          gramaje_esperado: number
          gramaje_medido_1: number
          gramaje_medido_2: number
          gramaje_medido_3: number
          gramaje_promedio: number | null
          id: string
          incidencia_origen_id: string | null
          maquina_id: string
          notas: string | null
          proxima_calibracion_sugerida: string | null
          tecnico_id: string
          tipo: Database["public"]["Enums"]["calibracion_tipo"]
          tolva_id: string | null
        }
        Insert: {
          ajuste_aplicado?: boolean
          alerta_origen_id?: string | null
          created_at?: string
          descripcion_ajuste?: string | null
          desviacion_porcentaje?: number | null
          fecha?: string
          foto_url?: string | null
          gramaje_esperado: number
          gramaje_medido_1: number
          gramaje_medido_2: number
          gramaje_medido_3: number
          gramaje_promedio?: number | null
          id?: string
          incidencia_origen_id?: string | null
          maquina_id: string
          notas?: string | null
          proxima_calibracion_sugerida?: string | null
          tecnico_id: string
          tipo: Database["public"]["Enums"]["calibracion_tipo"]
          tolva_id?: string | null
        }
        Update: {
          ajuste_aplicado?: boolean
          alerta_origen_id?: string | null
          created_at?: string
          descripcion_ajuste?: string | null
          desviacion_porcentaje?: number | null
          fecha?: string
          foto_url?: string | null
          gramaje_esperado?: number
          gramaje_medido_1?: number
          gramaje_medido_2?: number
          gramaje_medido_3?: number
          gramaje_promedio?: number | null
          id?: string
          incidencia_origen_id?: string | null
          maquina_id?: string
          notas?: string | null
          proxima_calibracion_sugerida?: string | null
          tecnico_id?: string
          tipo?: Database["public"]["Enums"]["calibracion_tipo"]
          tolva_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calibraciones_maquina_alerta_origen_id_fkey"
            columns: ["alerta_origen_id"]
            isOneToOne: false
            referencedRelation: "alertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibraciones_maquina_incidencia_origen_id_fkey"
            columns: ["incidencia_origen_id"]
            isOneToOne: false
            referencedRelation: "incidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibraciones_maquina_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibraciones_maquina_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibraciones_maquina_tolva_id_fkey"
            columns: ["tolva_id"]
            isOneToOne: false
            referencedRelation: "tolvas"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          asignacion_id: string
          created_at: string
          fecha_entrada: string
          fecha_salida: string | null
          foto_evidencia_url: string | null
          id: string
          lat: number | null
          lng: number | null
          maquina_id: string
          metodo: Database["public"]["Enums"]["checkin_metodo"]
          motivo_manual: string | null
          notas: string | null
          operador_id: string
          precision_m: number | null
          tiempo_en_sitio_seg: number | null
          validado: boolean
        }
        Insert: {
          asignacion_id: string
          created_at?: string
          fecha_entrada?: string
          fecha_salida?: string | null
          foto_evidencia_url?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          maquina_id: string
          metodo: Database["public"]["Enums"]["checkin_metodo"]
          motivo_manual?: string | null
          notas?: string | null
          operador_id: string
          precision_m?: number | null
          tiempo_en_sitio_seg?: number | null
          validado?: boolean
        }
        Update: {
          asignacion_id?: string
          created_at?: string
          fecha_entrada?: string
          fecha_salida?: string | null
          foto_evidencia_url?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          maquina_id?: string
          metodo?: Database["public"]["Enums"]["checkin_metodo"]
          motivo_manual?: string | null
          notas?: string | null
          operador_id?: string
          precision_m?: number | null
          tiempo_en_sitio_seg?: number | null
          validado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "asignaciones_diarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cierres_mensuales: {
        Row: {
          cerrado_por: string | null
          conteo_almacen_completado: boolean
          created_at: string
          estado: Database["public"]["Enums"]["cierre_estado"]
          fecha_cierre: string | null
          fecha_inicio_cierre: string | null
          id: string
          maquinas_pesadas: number
          notas: string | null
          periodo_anio: number
          periodo_mes: number
          total_maquinas_periodo: number | null
          updated_at: string
        }
        Insert: {
          cerrado_por?: string | null
          conteo_almacen_completado?: boolean
          created_at?: string
          estado?: Database["public"]["Enums"]["cierre_estado"]
          fecha_cierre?: string | null
          fecha_inicio_cierre?: string | null
          id?: string
          maquinas_pesadas?: number
          notas?: string | null
          periodo_anio: number
          periodo_mes: number
          total_maquinas_periodo?: number | null
          updated_at?: string
        }
        Update: {
          cerrado_por?: string | null
          conteo_almacen_completado?: boolean
          created_at?: string
          estado?: Database["public"]["Enums"]["cierre_estado"]
          fecha_cierre?: string | null
          fecha_inicio_cierre?: string | null
          id?: string
          maquinas_pesadas?: number
          notas?: string | null
          periodo_anio?: number
          periodo_mes?: number
          total_maquinas_periodo?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cierres_mensuales_cerrado_por_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_tel: string | null
          created_at: string
          emails_reporte: string[] | null
          id: string
          nombre: string
          notas: string | null
          razon_social: string | null
          rfc: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_tel?: string | null
          created_at?: string
          emails_reporte?: string[] | null
          id?: string
          nombre: string
          notas?: string | null
          razon_social?: string | null
          rfc?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_tel?: string | null
          created_at?: string
          emails_reporte?: string[] | null
          id?: string
          nombre?: string
          notas?: string | null
          razon_social?: string | null
          rfc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      config_global: {
        Row: {
          actualizado_por: string | null
          clave: string
          created_at: string
          descripcion: string | null
          id: string
          tipo_dato: string
          valor: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          actualizado_por?: string | null
          clave: string
          created_at?: string
          descripcion?: string | null
          id?: string
          tipo_dato: string
          valor: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          actualizado_por?: string | null
          clave?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          tipo_dato?: string
          valor?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "config_global_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conteo_cartuchos_items: {
        Row: {
          cantidad_fisica: number
          cantidad_sistema: number
          conteo_id: string
          created_at: string
          diferencia: number | null
          encartuchado_id: string
          id: string
          notas: string | null
          producto_id: string
          valor_diferencia: number | null
        }
        Insert: {
          cantidad_fisica: number
          cantidad_sistema: number
          conteo_id: string
          created_at?: string
          diferencia?: number | null
          encartuchado_id: string
          id?: string
          notas?: string | null
          producto_id: string
          valor_diferencia?: number | null
        }
        Update: {
          cantidad_fisica?: number
          cantidad_sistema?: number
          conteo_id?: string
          created_at?: string
          diferencia?: number | null
          encartuchado_id?: string
          id?: string
          notas?: string | null
          producto_id?: string
          valor_diferencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conteo_cartuchos_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "conteos_almacen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_cartuchos_items_encartuchado_id_fkey"
            columns: ["encartuchado_id"]
            isOneToOne: false
            referencedRelation: "encartuchados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_cartuchos_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      conteo_granel_items: {
        Row: {
          conteo_id: string
          created_at: string
          diferencia: number | null
          gramos_fisicos: number
          gramos_sistema: number
          id: string
          lote_id: string
          notas: string | null
          valor_diferencia: number | null
        }
        Insert: {
          conteo_id: string
          created_at?: string
          diferencia?: number | null
          gramos_fisicos: number
          gramos_sistema: number
          id?: string
          lote_id: string
          notas?: string | null
          valor_diferencia?: number | null
        }
        Update: {
          conteo_id?: string
          created_at?: string
          diferencia?: number | null
          gramos_fisicos?: number
          gramos_sistema?: number
          id?: string
          lote_id?: string
          notas?: string | null
          valor_diferencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conteo_granel_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "conteos_almacen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_granel_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      conteos_almacen: {
        Row: {
          cierre_id: string
          created_at: string
          estado: string
          fecha: string
          id: string
          notas: string | null
          realizado_por: string
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
          cierre_id: string
          created_at?: string
          estado?: string
          fecha?: string
          id?: string
          notas?: string | null
          realizado_por: string
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
          cierre_id?: string
          created_at?: string
          estado?: string
          fecha?: string
          id?: string
          notas?: string | null
          realizado_por?: string
          supervisor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteos_almacen_cierre_id_fkey"
            columns: ["cierre_id"]
            isOneToOne: true
            referencedRelation: "cierres_mensuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_almacen_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_almacen_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_cliente: {
        Row: {
          base_calculo: string | null
          cliente_id: string
          creado_por: string | null
          created_at: string
          id: string
          notas: string | null
          porcentaje_revenue_share: number | null
          renta_mensual_fija: number | null
          tipo: Database["public"]["Enums"]["contrato_tipo"]
          updated_at: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          base_calculo?: string | null
          cliente_id: string
          creado_por?: string | null
          created_at?: string
          id?: string
          notas?: string | null
          porcentaje_revenue_share?: number | null
          renta_mensual_fija?: number | null
          tipo: Database["public"]["Enums"]["contrato_tipo"]
          updated_at?: string
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          base_calculo?: string | null
          cliente_id?: string
          creado_por?: string | null
          created_at?: string
          id?: string
          notas?: string | null
          porcentaje_revenue_share?: number | null
          renta_mensual_fija?: number | null
          tipo?: Database["public"]["Enums"]["contrato_tipo"]
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_cliente_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      devoluciones_almacen: {
        Row: {
          cantidad_calculada: number
          cantidad_recibida_almacen: number | null
          created_at: string
          encartuchado_id: string
          estado: Database["public"]["Enums"]["devolucion_estado"]
          fecha_recepcion: string | null
          id: string
          incidencia_id: string | null
          llenado_item_id: string
          notas: string | null
          operador_id: string
          producto_id: string
          recibida_por: string | null
          updated_at: string
        }
        Insert: {
          cantidad_calculada: number
          cantidad_recibida_almacen?: number | null
          created_at?: string
          encartuchado_id: string
          estado?: Database["public"]["Enums"]["devolucion_estado"]
          fecha_recepcion?: string | null
          id?: string
          incidencia_id?: string | null
          llenado_item_id: string
          notas?: string | null
          operador_id: string
          producto_id: string
          recibida_por?: string | null
          updated_at?: string
        }
        Update: {
          cantidad_calculada?: number
          cantidad_recibida_almacen?: number | null
          created_at?: string
          encartuchado_id?: string
          estado?: Database["public"]["Enums"]["devolucion_estado"]
          fecha_recepcion?: string | null
          id?: string
          incidencia_id?: string | null
          llenado_item_id?: string
          notas?: string | null
          operador_id?: string
          producto_id?: string
          recibida_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_almacen_encartuchado_id_fkey"
            columns: ["encartuchado_id"]
            isOneToOne: false
            referencedRelation: "encartuchados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_almacen_incidencia_id_fkey"
            columns: ["incidencia_id"]
            isOneToOne: false
            referencedRelation: "incidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_almacen_llenado_item_id_fkey"
            columns: ["llenado_item_id"]
            isOneToOne: true
            referencedRelation: "llenado_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_almacen_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_almacen_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_almacen_recibida_por_fkey"
            columns: ["recibida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      encartuchado_lotes: {
        Row: {
          costo_por_gramo_lote: number
          created_at: string
          encartuchado_id: string
          gramos_consumidos: number
          id: string
          lote_id: string
          valor_aportado: number
        }
        Insert: {
          costo_por_gramo_lote: number
          created_at?: string
          encartuchado_id: string
          gramos_consumidos: number
          id?: string
          lote_id: string
          valor_aportado: number
        }
        Update: {
          costo_por_gramo_lote?: number
          created_at?: string
          encartuchado_id?: string
          gramos_consumidos?: number
          id?: string
          lote_id?: string
          valor_aportado?: number
        }
        Relationships: [
          {
            foreignKeyName: "encartuchado_lotes_encartuchado_id_fkey"
            columns: ["encartuchado_id"]
            isOneToOne: false
            referencedRelation: "encartuchados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encartuchado_lotes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      encartuchados: {
        Row: {
          cantidad_disponible: number
          cartuchos_producidos: number
          costo_promedio_g: number
          created_at: string
          fecha: string
          folio: string
          gramos_merma: number
          gramos_por_cartucho: number
          gramos_totales_consumidos: number
          id: string
          notas: string | null
          operario_id: string | null
          producto_id: string
        }
        Insert: {
          cantidad_disponible: number
          cartuchos_producidos: number
          costo_promedio_g: number
          created_at?: string
          fecha?: string
          folio: string
          gramos_merma?: number
          gramos_por_cartucho?: number
          gramos_totales_consumidos: number
          id?: string
          notas?: string | null
          operario_id?: string | null
          producto_id: string
        }
        Update: {
          cantidad_disponible?: number
          cartuchos_producidos?: number
          costo_promedio_g?: number
          created_at?: string
          fecha?: string
          folio?: string
          gramos_merma?: number
          gramos_por_cartucho?: number
          gramos_totales_consumidos?: number
          id?: string
          notas?: string | null
          operario_id?: string | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "encartuchados_operario_id_fkey"
            columns: ["operario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encartuchados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias: {
        Row: {
          autorizada_por: string | null
          cartuchos_afectados: number | null
          check_in_id: string | null
          created_at: string
          descripcion: string
          encartuchado_afectado_id: string | null
          estado: Database["public"]["Enums"]["incidencia_estado"]
          fecha_apertura: string
          fecha_autorizacion: string | null
          fecha_cierre: string | null
          folio: string
          foto_url: string | null
          id: string
          maquina_id: string | null
          notas_resolucion: string | null
          operador_id: string | null
          producto_afectado_id: string | null
          requiere_autorizacion_merma: boolean
          severidad: Database["public"]["Enums"]["incidencia_severidad"]
          tipo: Database["public"]["Enums"]["incidencia_tipo"]
          updated_at: string
        }
        Insert: {
          autorizada_por?: string | null
          cartuchos_afectados?: number | null
          check_in_id?: string | null
          created_at?: string
          descripcion: string
          encartuchado_afectado_id?: string | null
          estado?: Database["public"]["Enums"]["incidencia_estado"]
          fecha_apertura?: string
          fecha_autorizacion?: string | null
          fecha_cierre?: string | null
          folio: string
          foto_url?: string | null
          id?: string
          maquina_id?: string | null
          notas_resolucion?: string | null
          operador_id?: string | null
          producto_afectado_id?: string | null
          requiere_autorizacion_merma?: boolean
          severidad?: Database["public"]["Enums"]["incidencia_severidad"]
          tipo: Database["public"]["Enums"]["incidencia_tipo"]
          updated_at?: string
        }
        Update: {
          autorizada_por?: string | null
          cartuchos_afectados?: number | null
          check_in_id?: string | null
          created_at?: string
          descripcion?: string
          encartuchado_afectado_id?: string | null
          estado?: Database["public"]["Enums"]["incidencia_estado"]
          fecha_apertura?: string
          fecha_autorizacion?: string | null
          fecha_cierre?: string | null
          folio?: string
          foto_url?: string | null
          id?: string
          maquina_id?: string | null
          notas_resolucion?: string | null
          operador_id?: string | null
          producto_afectado_id?: string | null
          requiere_autorizacion_merma?: boolean
          severidad?: Database["public"]["Enums"]["incidencia_severidad"]
          tipo?: Database["public"]["Enums"]["incidencia_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_autorizada_por_fkey"
            columns: ["autorizada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_encartuchado_afectado_id_fkey"
            columns: ["encartuchado_afectado_id"]
            isOneToOne: false
            referencedRelation: "encartuchados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_producto_afectado_id_fkey"
            columns: ["producto_afectado_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas: {
        Row: {
          asignacion_id: string
          created_at: string
          hora_inicio: string
          hora_ultima_actividad: string | null
          id: string
          lat_inicio: number | null
          lng_inicio: number | null
          notas: string | null
          operador_id: string
        }
        Insert: {
          asignacion_id: string
          created_at?: string
          hora_inicio?: string
          hora_ultima_actividad?: string | null
          id?: string
          lat_inicio?: number | null
          lng_inicio?: number | null
          notas?: string | null
          operador_id: string
        }
        Update: {
          asignacion_id?: string
          created_at?: string
          hora_inicio?: string
          hora_ultima_actividad?: string | null
          id?: string
          lat_inicio?: number | null
          lng_inicio?: number | null
          notas?: string | null
          operador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornadas_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: true
            referencedRelation: "asignaciones_diarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornadas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      llenado_items: {
        Row: {
          cartuchos_cargados: number
          cartuchos_devolucion: number | null
          cartuchos_planeados: number
          costo_promedio_g_tolva_antes: number | null
          costo_promedio_g_tolva_despues: number | null
          created_at: string
          encartuchado_id: string
          gramos_cargados: number
          id: string
          inventario_tolva_antes: number | null
          inventario_tolva_despues: number | null
          llenado_id: string
          notas: string | null
          surtido_item_id: string
          tolva_id: string
        }
        Insert: {
          cartuchos_cargados: number
          cartuchos_devolucion?: number | null
          cartuchos_planeados: number
          costo_promedio_g_tolva_antes?: number | null
          costo_promedio_g_tolva_despues?: number | null
          created_at?: string
          encartuchado_id: string
          gramos_cargados: number
          id?: string
          inventario_tolva_antes?: number | null
          inventario_tolva_despues?: number | null
          llenado_id: string
          notas?: string | null
          surtido_item_id: string
          tolva_id: string
        }
        Update: {
          cartuchos_cargados?: number
          cartuchos_devolucion?: number | null
          cartuchos_planeados?: number
          costo_promedio_g_tolva_antes?: number | null
          costo_promedio_g_tolva_despues?: number | null
          created_at?: string
          encartuchado_id?: string
          gramos_cargados?: number
          id?: string
          inventario_tolva_antes?: number | null
          inventario_tolva_despues?: number | null
          llenado_id?: string
          notas?: string | null
          surtido_item_id?: string
          tolva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llenado_items_encartuchado_id_fkey"
            columns: ["encartuchado_id"]
            isOneToOne: false
            referencedRelation: "encartuchados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llenado_items_llenado_id_fkey"
            columns: ["llenado_id"]
            isOneToOne: false
            referencedRelation: "llenados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llenado_items_surtido_item_id_fkey"
            columns: ["surtido_item_id"]
            isOneToOne: false
            referencedRelation: "surtido_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llenado_items_tolva_id_fkey"
            columns: ["tolva_id"]
            isOneToOne: false
            referencedRelation: "tolvas"
            referencedColumns: ["id"]
          },
        ]
      }
      llenados: {
        Row: {
          check_in_id: string
          created_at: string
          evidencia_url: string | null
          fecha: string
          id: string
          maquina_id: string
          notas: string | null
          operador_id: string
        }
        Insert: {
          check_in_id: string
          created_at?: string
          evidencia_url?: string | null
          fecha?: string
          id?: string
          maquina_id: string
          notas?: string | null
          operador_id: string
        }
        Update: {
          check_in_id?: string
          created_at?: string
          evidencia_url?: string | null
          fecha?: string
          id?: string
          maquina_id?: string
          notas?: string | null
          operador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llenados_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: true
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llenados_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llenados_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          activo: boolean
          codigo_lote: string
          costo_por_gramo: number
          created_at: string
          fecha_caducidad: string | null
          fecha_recepcion: string
          gramos_disponibles_granel: number
          gramos_iniciales: number
          id: string
          notas: string | null
          presentacion_id: string | null
          producto_id: string
          proveedor_id: string
          recepcion_id: string
          unidades_disponibles: number | null
          unidades_iniciales: number | null
        }
        Insert: {
          activo?: boolean
          codigo_lote: string
          costo_por_gramo: number
          created_at?: string
          fecha_caducidad?: string | null
          fecha_recepcion?: string
          gramos_disponibles_granel?: number
          gramos_iniciales: number
          id?: string
          notas?: string | null
          presentacion_id?: string | null
          producto_id: string
          proveedor_id: string
          recepcion_id: string
          unidades_disponibles?: number | null
          unidades_iniciales?: number | null
        }
        Update: {
          activo?: boolean
          codigo_lote?: string
          costo_por_gramo?: number
          created_at?: string
          fecha_caducidad?: string | null
          fecha_recepcion?: string
          gramos_disponibles_granel?: number
          gramos_iniciales?: number
          id?: string
          notas?: string | null
          presentacion_id?: string | null
          producto_id?: string
          proveedor_id?: string
          recepcion_id?: string
          unidades_disponibles?: number | null
          unidades_iniciales?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_presentacion_id_fkey"
            columns: ["presentacion_id"]
            isOneToOne: false
            referencedRelation: "presentaciones_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "recepciones"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinas: {
        Row: {
          activo: boolean
          alias: string | null
          capacidad_max_tolva_g: number
          created_at: string
          estado: Database["public"]["Enums"]["maquina_estado"]
          fecha_instalacion: string | null
          frecuencia_visita_dias: number
          id: string
          modelo: string | null
          nayax_machine_id: string | null
          nayax_serial: string | null
          notas: string | null
          num_tolvas: number
          proxima_calibracion_fecha: string | null
          qr_codigo: string | null
          serie: string
          ubicacion_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          alias?: string | null
          capacidad_max_tolva_g?: number
          created_at?: string
          estado?: Database["public"]["Enums"]["maquina_estado"]
          fecha_instalacion?: string | null
          frecuencia_visita_dias?: number
          id?: string
          modelo?: string | null
          nayax_machine_id?: string | null
          nayax_serial?: string | null
          notas?: string | null
          num_tolvas?: number
          proxima_calibracion_fecha?: string | null
          qr_codigo?: string | null
          serie: string
          ubicacion_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          alias?: string | null
          capacidad_max_tolva_g?: number
          created_at?: string
          estado?: Database["public"]["Enums"]["maquina_estado"]
          fecha_instalacion?: string | null
          frecuencia_visita_dias?: number
          id?: string
          modelo?: string | null
          nayax_machine_id?: string | null
          nayax_serial?: string | null
          notas?: string | null
          num_tolvas?: number
          proxima_calibracion_fecha?: string | null
          qr_codigo?: string | null
          serie?: string
          ubicacion_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maquinas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          cantidad_cartuchos: number
          cantidad_vasos: number
          cierre_id: string | null
          cliente_id: string | null
          costo_por_gramo_snapshot: number
          created_at: string
          encartuchado_id: string | null
          fecha: string
          gramos: number
          id: string
          lote_id: string | null
          maquina_id: string | null
          notas: string | null
          presentacion: Database["public"]["Enums"]["mov_presentacion"]
          producto_id: string
          referencia_id: string
          referencia_tabla: string
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
          tolva_id: string | null
          usuario_id: string | null
          valor_movimiento: number
        }
        Insert: {
          cantidad_cartuchos?: number
          cantidad_vasos?: number
          cierre_id?: string | null
          cliente_id?: string | null
          costo_por_gramo_snapshot?: number
          created_at?: string
          encartuchado_id?: string | null
          fecha?: string
          gramos?: number
          id?: string
          lote_id?: string | null
          maquina_id?: string | null
          notas?: string | null
          presentacion: Database["public"]["Enums"]["mov_presentacion"]
          producto_id: string
          referencia_id: string
          referencia_tabla: string
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
          tolva_id?: string | null
          usuario_id?: string | null
          valor_movimiento?: number
        }
        Update: {
          cantidad_cartuchos?: number
          cantidad_vasos?: number
          cierre_id?: string | null
          cliente_id?: string | null
          costo_por_gramo_snapshot?: number
          created_at?: string
          encartuchado_id?: string | null
          fecha?: string
          gramos?: number
          id?: string
          lote_id?: string | null
          maquina_id?: string | null
          notas?: string | null
          presentacion?: Database["public"]["Enums"]["mov_presentacion"]
          producto_id?: string
          referencia_id?: string
          referencia_tabla?: string
          tipo?: Database["public"]["Enums"]["movimiento_tipo"]
          tolva_id?: string | null
          usuario_id?: string | null
          valor_movimiento?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_cierre_id_fkey"
            columns: ["cierre_id"]
            isOneToOne: false
            referencedRelation: "cierres_mensuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_encartuchado_id_fkey"
            columns: ["encartuchado_id"]
            isOneToOne: false
            referencedRelation: "encartuchados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_tolva_id_fkey"
            columns: ["tolva_id"]
            isOneToOne: false
            referencedRelation: "tolvas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nayax_sync_log: {
        Row: {
          created_at: string
          cursor_desde: string | null
          cursor_hasta: string | null
          duracion_seg: number | null
          errores: number
          estado: string | null
          fin: string | null
          id: string
          inicio: string
          lag_minutos: number | null
          mensaje_error: string | null
          transacciones_duplicadas: number
          transacciones_jaladas: number
          transacciones_nuevas: number
        }
        Insert: {
          created_at?: string
          cursor_desde?: string | null
          cursor_hasta?: string | null
          duracion_seg?: number | null
          errores?: number
          estado?: string | null
          fin?: string | null
          id?: string
          inicio?: string
          lag_minutos?: number | null
          mensaje_error?: string | null
          transacciones_duplicadas?: number
          transacciones_jaladas?: number
          transacciones_nuevas?: number
        }
        Update: {
          created_at?: string
          cursor_desde?: string | null
          cursor_hasta?: string | null
          duracion_seg?: number | null
          errores?: number
          estado?: string | null
          fin?: string | null
          id?: string
          inicio?: string
          lag_minutos?: number | null
          mensaje_error?: string | null
          transacciones_duplicadas?: number
          transacciones_jaladas?: number
          transacciones_nuevas?: number
        }
        Relationships: []
      }
      oc_items: {
        Row: {
          cantidad: number
          costo_unitario: number
          created_at: string
          id: string
          notas: string | null
          oc_id: string
          presentacion_id: string
          recibido: number
          subtotal_item: number
        }
        Insert: {
          cantidad: number
          costo_unitario: number
          created_at?: string
          id?: string
          notas?: string | null
          oc_id: string
          presentacion_id: string
          recibido?: number
          subtotal_item: number
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          id?: string
          notas?: string | null
          oc_id?: string
          presentacion_id?: string
          recibido?: number
          subtotal_item?: number
        }
        Relationships: [
          {
            foreignKeyName: "oc_items_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_items_presentacion_id_fkey"
            columns: ["presentacion_id"]
            isOneToOne: false
            referencedRelation: "presentaciones_proveedor"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_compra: {
        Row: {
          aprobado_por: string | null
          creado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["oc_estado"]
          fecha_aprobacion: string | null
          fecha_emision: string
          fecha_esperada: string | null
          folio: string
          id: string
          iva: number
          moneda: string
          notas: string | null
          proveedor_id: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          aprobado_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["oc_estado"]
          fecha_aprobacion?: string | null
          fecha_emision?: string
          fecha_esperada?: string | null
          folio: string
          id?: string
          iva?: number
          moneda?: string
          notas?: string | null
          proveedor_id: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          aprobado_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["oc_estado"]
          fecha_aprobacion?: string | null
          fecha_emision?: string
          fecha_esperada?: string | null
          folio?: string
          id?: string
          iva?: number
          moneda?: string
          notas?: string | null
          proveedor_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      pesaje_tolva_items: {
        Row: {
          alerta_generada: boolean
          created_at: string
          diferencia_gramos: number | null
          diferencia_porcentaje: number | null
          foto_url: string | null
          gramos_medidos: number
          gramos_teoricos: number
          id: string
          notas: string | null
          pesaje_id: string
          tolva_id: string
          valor_diferencia: number | null
        }
        Insert: {
          alerta_generada?: boolean
          created_at?: string
          diferencia_gramos?: number | null
          diferencia_porcentaje?: number | null
          foto_url?: string | null
          gramos_medidos: number
          gramos_teoricos: number
          id?: string
          notas?: string | null
          pesaje_id: string
          tolva_id: string
          valor_diferencia?: number | null
        }
        Update: {
          alerta_generada?: boolean
          created_at?: string
          diferencia_gramos?: number | null
          diferencia_porcentaje?: number | null
          foto_url?: string | null
          gramos_medidos?: number
          gramos_teoricos?: number
          id?: string
          notas?: string | null
          pesaje_id?: string
          tolva_id?: string
          valor_diferencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pesaje_tolva_items_pesaje_id_fkey"
            columns: ["pesaje_id"]
            isOneToOne: false
            referencedRelation: "pesajes_maquina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesaje_tolva_items_tolva_id_fkey"
            columns: ["tolva_id"]
            isOneToOne: false
            referencedRelation: "tolvas"
            referencedColumns: ["id"]
          },
        ]
      }
      pesajes_maquina: {
        Row: {
          check_in_id: string
          cierre_id: string
          created_at: string
          fecha: string
          id: string
          maquina_id: string
          notas: string | null
          operador_id: string
        }
        Insert: {
          check_in_id: string
          cierre_id: string
          created_at?: string
          fecha?: string
          id?: string
          maquina_id: string
          notas?: string | null
          operador_id: string
        }
        Update: {
          check_in_id?: string
          cierre_id?: string
          created_at?: string
          fecha?: string
          id?: string
          maquina_id?: string
          notas?: string | null
          operador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pesajes_maquina_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_maquina_cierre_id_fkey"
            columns: ["cierre_id"]
            isOneToOne: false
            referencedRelation: "cierres_mensuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_maquina_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pesajes_maquina_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planograma_historico: {
        Row: {
          creado_por: string | null
          created_at: string
          gramaje_servicio: number
          id: string
          maquina_id: string
          motivo_cambio: string | null
          nayax_item_code: string | null
          precio_venta: number
          producto_id: string
          tolva_numero: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          gramaje_servicio: number
          id?: string
          maquina_id: string
          motivo_cambio?: string | null
          nayax_item_code?: string | null
          precio_venta: number
          producto_id: string
          tolva_numero: number
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          gramaje_servicio?: number
          id?: string
          maquina_id?: string
          motivo_cambio?: string | null
          nayax_item_code?: string | null
          precio_venta?: number
          producto_id?: string
          tolva_numero?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planograma_historico_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planograma_historico_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planograma_historico_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      presentaciones_proveedor: {
        Row: {
          activo: boolean
          costo_unitario: number
          created_at: string
          id: string
          moneda: string
          nombre_presentacion: string
          peso_neto_gramos: number
          producto_id: string
          proveedor_id: string
          sku_proveedor: string | null
          unidades_por_presentacion: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          costo_unitario: number
          created_at?: string
          id?: string
          moneda?: string
          nombre_presentacion: string
          peso_neto_gramos: number
          producto_id: string
          proveedor_id: string
          sku_proveedor?: string | null
          unidades_por_presentacion?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          costo_unitario?: number
          created_at?: string
          id?: string
          moneda?: string
          nombre_presentacion?: string
          peso_neto_gramos?: number
          producto_id?: string
          proveedor_id?: string
          sku_proveedor?: string | null
          unidades_por_presentacion?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentaciones_proveedor_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presentaciones_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          categoria: string | null
          cliente_exclusivo_id: string | null
          created_at: string
          gramaje_cartucho_default: number
          gramaje_servicio_default: number | null
          id: string
          marca: string | null
          nombre: string
          notas: string | null
          precio_venta_default: number | null
          sabor: string | null
          sku: string
          tipo: Database["public"]["Enums"]["producto_tipo"]
          unidad_medida: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria?: string | null
          cliente_exclusivo_id?: string | null
          created_at?: string
          gramaje_cartucho_default?: number
          gramaje_servicio_default?: number | null
          id?: string
          marca?: string | null
          nombre: string
          notas?: string | null
          precio_venta_default?: number | null
          sabor?: string | null
          sku: string
          tipo: Database["public"]["Enums"]["producto_tipo"]
          unidad_medida?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria?: string | null
          cliente_exclusivo_id?: string | null
          created_at?: string
          gramaje_cartucho_default?: number
          gramaje_servicio_default?: number | null
          id?: string
          marca?: string | null
          nombre?: string
          notas?: string | null
          precio_venta_default?: number | null
          sabor?: string | null
          sku?: string
          tipo?: Database["public"]["Enums"]["producto_tipo"]
          unidad_medida?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_cliente_exclusivo_id_fkey"
            columns: ["cliente_exclusivo_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          activo: boolean
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_tel: string | null
          created_at: string
          dias_credito: number
          id: string
          nombre: string
          notas: string | null
          razon_social: string | null
          rfc: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_tel?: string | null
          created_at?: string
          dias_credito?: number
          id?: string
          nombre: string
          notas?: string | null
          razon_social?: string | null
          rfc?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_tel?: string | null
          created_at?: string
          dias_credito?: number
          id?: string
          nombre?: string
          notas?: string | null
          razon_social?: string | null
          rfc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recepcion_items: {
        Row: {
          created_at: string
          id: string
          lote_id: string
          notas: string | null
          oc_item_id: string
          peso_total_gramos: number
          presentaciones_recibidas: number
          recepcion_id: string
          unidades_totales: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          lote_id: string
          notas?: string | null
          oc_item_id: string
          peso_total_gramos?: number
          presentaciones_recibidas: number
          recepcion_id: string
          unidades_totales?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          lote_id?: string
          notas?: string | null
          oc_item_id?: string
          peso_total_gramos?: number
          presentaciones_recibidas?: number
          recepcion_id?: string
          unidades_totales?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recepcion_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_items_oc_item_id_fkey"
            columns: ["oc_item_id"]
            isOneToOne: false
            referencedRelation: "oc_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_items_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "recepciones"
            referencedColumns: ["id"]
          },
        ]
      }
      recepciones: {
        Row: {
          created_at: string
          factura_proveedor: string | null
          fecha: string
          folio: string
          id: string
          notas: string | null
          oc_id: string
          recibido_por: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          factura_proveedor?: string | null
          fecha?: string
          folio: string
          id?: string
          notas?: string | null
          oc_id: string
          recibido_por: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          factura_proveedor?: string | null
          fecha?: string
          folio?: string
          id?: string
          notas?: string | null
          oc_id?: string
          recibido_por?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepciones_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_recibido_por_fkey"
            columns: ["recibido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes_cliente: {
        Row: {
          aprobado_por: string | null
          archivo_csv_url: string | null
          archivo_pdf_url: string | null
          cierre_id: string
          cliente_id: string
          comision_cliente: number | null
          created_at: string
          enviado_a: string[] | null
          estado: Database["public"]["Enums"]["reporte_estado"]
          fecha_envio: string | null
          fecha_generacion: string | null
          id: string
          notas: string | null
          periodo_anio: number
          periodo_mes: number
          total_consumo_g: number | null
          total_shakes: number | null
          total_ventas_brutas: number | null
          total_ventas_netas: number | null
          updated_at: string
        }
        Insert: {
          aprobado_por?: string | null
          archivo_csv_url?: string | null
          archivo_pdf_url?: string | null
          cierre_id: string
          cliente_id: string
          comision_cliente?: number | null
          created_at?: string
          enviado_a?: string[] | null
          estado?: Database["public"]["Enums"]["reporte_estado"]
          fecha_envio?: string | null
          fecha_generacion?: string | null
          id?: string
          notas?: string | null
          periodo_anio: number
          periodo_mes: number
          total_consumo_g?: number | null
          total_shakes?: number | null
          total_ventas_brutas?: number | null
          total_ventas_netas?: number | null
          updated_at?: string
        }
        Update: {
          aprobado_por?: string | null
          archivo_csv_url?: string | null
          archivo_pdf_url?: string | null
          cierre_id?: string
          cliente_id?: string
          comision_cliente?: number | null
          created_at?: string
          enviado_a?: string[] | null
          estado?: Database["public"]["Enums"]["reporte_estado"]
          fecha_envio?: string | null
          fecha_generacion?: string | null
          id?: string
          notas?: string | null
          periodo_anio?: number
          periodo_mes?: number
          total_consumo_g?: number | null
          total_shakes?: number | null
          total_ventas_brutas?: number | null
          total_ventas_netas?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reportes_cliente_aprobado_por_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_cliente_cierre_id_fkey"
            columns: ["cierre_id"]
            isOneToOne: false
            referencedRelation: "cierres_mensuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      ruta_maquinas: {
        Row: {
          created_at: string
          maquina_id: string
          orden: number
          ruta_id: string
        }
        Insert: {
          created_at?: string
          maquina_id: string
          orden?: number
          ruta_id: string
        }
        Update: {
          created_at?: string
          maquina_id?: string
          orden?: number
          ruta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruta_maquinas_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: true
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_maquinas_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas"
            referencedColumns: ["id"]
          },
        ]
      }
      rutas: {
        Row: {
          activa: boolean
          color_hex: string | null
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          operador_titular_id: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          color_hex?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          operador_titular_id?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          color_hex?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          operador_titular_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rutas_operador_titular_id_fkey"
            columns: ["operador_titular_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      surtido_items: {
        Row: {
          cartuchos_entregados: number
          cartuchos_sugeridos: number
          created_at: string
          encartuchado_id: string | null
          id: string
          lote_vaso_id: string | null
          maquina_id: string
          notas: string | null
          producto_id: string
          surtido_id: string
          vasos_entregados: number
          vasos_sugeridos: number
        }
        Insert: {
          cartuchos_entregados?: number
          cartuchos_sugeridos?: number
          created_at?: string
          encartuchado_id?: string | null
          id?: string
          lote_vaso_id?: string | null
          maquina_id: string
          notas?: string | null
          producto_id: string
          surtido_id: string
          vasos_entregados?: number
          vasos_sugeridos?: number
        }
        Update: {
          cartuchos_entregados?: number
          cartuchos_sugeridos?: number
          created_at?: string
          encartuchado_id?: string | null
          id?: string
          lote_vaso_id?: string | null
          maquina_id?: string
          notas?: string | null
          producto_id?: string
          surtido_id?: string
          vasos_entregados?: number
          vasos_sugeridos?: number
        }
        Relationships: [
          {
            foreignKeyName: "surtido_items_encartuchado_id_fkey"
            columns: ["encartuchado_id"]
            isOneToOne: false
            referencedRelation: "encartuchados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surtido_items_lote_vaso_id_fkey"
            columns: ["lote_vaso_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surtido_items_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surtido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surtido_items_surtido_id_fkey"
            columns: ["surtido_id"]
            isOneToOne: false
            referencedRelation: "surtidos"
            referencedColumns: ["id"]
          },
        ]
      }
      surtidos: {
        Row: {
          asignacion_id: string
          creado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["surtido_estado"]
          fecha: string
          fecha_completado: string | null
          folio: string
          id: string
          notas: string | null
          surtido_por: string | null
          updated_at: string
        }
        Insert: {
          asignacion_id: string
          creado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["surtido_estado"]
          fecha?: string
          fecha_completado?: string | null
          folio: string
          id?: string
          notas?: string | null
          surtido_por?: string | null
          updated_at?: string
        }
        Update: {
          asignacion_id?: string
          creado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["surtido_estado"]
          fecha?: string
          fecha_completado?: string | null
          folio?: string
          id?: string
          notas?: string | null
          surtido_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surtidos_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: true
            referencedRelation: "asignaciones_diarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surtidos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surtidos_surtido_por_fkey"
            columns: ["surtido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tolvas: {
        Row: {
          capacidad_max_g: number
          costo_promedio_g_actual: number
          created_at: string
          gramaje_servicio: number | null
          id: string
          inventario_actual_g: number
          maquina_id: string
          nayax_item_code: string | null
          numero: number
          precio_venta: number | null
          producto_id: string | null
          ultimo_llenado_at: string | null
          ultimo_pesaje_at: string | null
          updated_at: string
        }
        Insert: {
          capacidad_max_g?: number
          costo_promedio_g_actual?: number
          created_at?: string
          gramaje_servicio?: number | null
          id?: string
          inventario_actual_g?: number
          maquina_id: string
          nayax_item_code?: string | null
          numero: number
          precio_venta?: number | null
          producto_id?: string | null
          ultimo_llenado_at?: string | null
          ultimo_pesaje_at?: string | null
          updated_at?: string
        }
        Update: {
          capacidad_max_g?: number
          costo_promedio_g_actual?: number
          created_at?: string
          gramaje_servicio?: number | null
          id?: string
          inventario_actual_g?: number
          maquina_id?: string
          nayax_item_code?: string | null
          numero?: number
          precio_venta?: number | null
          producto_id?: string | null
          ultimo_llenado_at?: string | null
          ultimo_pesaje_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tolvas_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tolvas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      ubicaciones: {
        Row: {
          activo: boolean
          ciudad: string | null
          cliente_id: string
          colonia: string | null
          cp: string | null
          created_at: string
          direccion: string | null
          estado: string | null
          horario_apertura: string | null
          horario_cierre: string | null
          id: string
          lat: number | null
          lng: number | null
          nombre: string
          notas: string | null
          radio_geofence_m: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          ciudad?: string | null
          cliente_id: string
          colonia?: string | null
          cp?: string | null
          created_at?: string
          direccion?: string | null
          estado?: string | null
          horario_apertura?: string | null
          horario_cierre?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          nombre: string
          notas?: string | null
          radio_geofence_m?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          ciudad?: string | null
          cliente_id?: string
          colonia?: string | null
          cp?: string | null
          created_at?: string
          direccion?: string | null
          estado?: string | null
          horario_apertura?: string | null
          horario_cierre?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          nombre?: string
          notas?: string | null
          radio_geofence_m?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ubicaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_maquina: {
        Row: {
          cargado_at: string
          cierre_id: string | null
          cliente_id: string | null
          comision_nayax_estimada: number
          costo_polvo: number
          costo_vaso: number
          fecha_transaccion: string
          gramos_dispensados: number
          id: string
          maquina_id: string
          margen_porcentaje: number | null
          metodo_pago: string | null
          nayax_transaction_id: string
          notas: string | null
          precio_bruto: number
          precio_neto: number
          producto_id: string | null
          sync_log_id: string | null
          ticket_id_nayax: string | null
          tolva_id: string | null
          utilidad_bruta: number
        }
        Insert: {
          cargado_at?: string
          cierre_id?: string | null
          cliente_id?: string | null
          comision_nayax_estimada?: number
          costo_polvo?: number
          costo_vaso?: number
          fecha_transaccion: string
          gramos_dispensados?: number
          id?: string
          maquina_id: string
          margen_porcentaje?: number | null
          metodo_pago?: string | null
          nayax_transaction_id: string
          notas?: string | null
          precio_bruto?: number
          precio_neto?: number
          producto_id?: string | null
          sync_log_id?: string | null
          ticket_id_nayax?: string | null
          tolva_id?: string | null
          utilidad_bruta?: number
        }
        Update: {
          cargado_at?: string
          cierre_id?: string | null
          cliente_id?: string | null
          comision_nayax_estimada?: number
          costo_polvo?: number
          costo_vaso?: number
          fecha_transaccion?: string
          gramos_dispensados?: number
          id?: string
          maquina_id?: string
          margen_porcentaje?: number | null
          metodo_pago?: string | null
          nayax_transaction_id?: string
          notas?: string | null
          precio_bruto?: number
          precio_neto?: number
          producto_id?: string | null
          sync_log_id?: string | null
          ticket_id_nayax?: string | null
          tolva_id?: string | null
          utilidad_bruta?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_maquina_cierre_id_fkey"
            columns: ["cierre_id"]
            isOneToOne: false
            referencedRelation: "cierres_mensuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_maquina_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_maquina_maquina_id_fkey"
            columns: ["maquina_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_maquina_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_maquina_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "nayax_sync_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_maquina_tolva_id_fkey"
            columns: ["tolva_id"]
            isOneToOne: false
            referencedRelation: "tolvas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      gen_folio: {
        Args: { prefijo: string; seq_name: string }
        Returns: string
      }
      user_has_role: {
        Args: { check_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
    }
    Enums: {
      alerta_estado: "activa" | "atendida" | "descartada"
      alerta_severidad: "info" | "warning" | "critical"
      alerta_tipo: "maquina_sin_venta_24h" | "discrepancia_pesaje_alta"
      app_role:
        | "direccion"
        | "compras"
        | "almacen"
        | "planeador"
        | "operador"
        | "admin"
      asignacion_estado:
        | "planeada"
        | "surtida"
        | "en_jornada"
        | "completada"
        | "cancelada"
      calibracion_tipo:
        | "preventiva_programada"
        | "correctiva_por_alerta"
        | "post_mantenimiento"
      checkin_metodo: "gps" | "qr" | "manual_supervisado"
      cierre_estado: "abierto" | "en_proceso" | "cerrado"
      contrato_tipo: "renta_fija" | "revenue_share" | "mixto"
      devolucion_estado:
        | "pendiente_devolucion"
        | "recibida_ok"
        | "recibida_con_diferencia"
      excepcion_motivo:
        | "ausencia_operador"
        | "emergencia"
        | "mantenimiento"
        | "otro"
      incidencia_estado: "abierta" | "en_revision" | "resuelta" | "descartada"
      incidencia_severidad: "baja" | "media" | "alta"
      incidencia_tipo:
        | "maquina_apagada"
        | "sin_conexion_nayax"
        | "tolva_atascada"
        | "producto_compactado"
        | "vandalismo"
        | "falta_vasos"
        | "producto_contaminado"
        | "acceso_denegado"
        | "queja_cliente"
        | "cartucho_danado"
        | "cartucho_perdido"
        | "discrepancia_devolucion"
        | "desviacion_calibracion"
        | "otro"
      maquina_estado: "operativa" | "mantenimiento" | "baja"
      mov_presentacion: "granel" | "cartucho" | "polvo_en_tolva" | "vaso"
      movimiento_tipo:
        | "recepcion"
        | "encartuchado_salida_granel"
        | "encartuchado_entrada_cartucho"
        | "merma_encartuchado"
        | "surtido_salida_cartucho"
        | "devolucion_entrada_cartucho"
        | "llenado_salida_cartucho"
        | "llenado_entrada_tolva"
        | "venta_salida_tolva"
        | "merma_ruta"
        | "ajuste_conteo_almacen"
        | "ajuste_conteo_maquina"
        | "ajuste_periodo_anterior"
        | "ajuste_manual"
      oc_estado: "borrador" | "enviada" | "parcial" | "recibida" | "cancelada"
      producto_tipo: "polvo" | "vaso"
      reporte_estado:
        | "en_generacion"
        | "generado"
        | "aprobado"
        | "enviado"
        | "error"
      surtido_estado: "pendiente" | "en_proceso" | "completado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alerta_estado: ["activa", "atendida", "descartada"],
      alerta_severidad: ["info", "warning", "critical"],
      alerta_tipo: ["maquina_sin_venta_24h", "discrepancia_pesaje_alta"],
      app_role: [
        "direccion",
        "compras",
        "almacen",
        "planeador",
        "operador",
        "admin",
      ],
      asignacion_estado: [
        "planeada",
        "surtida",
        "en_jornada",
        "completada",
        "cancelada",
      ],
      calibracion_tipo: [
        "preventiva_programada",
        "correctiva_por_alerta",
        "post_mantenimiento",
      ],
      checkin_metodo: ["gps", "qr", "manual_supervisado"],
      cierre_estado: ["abierto", "en_proceso", "cerrado"],
      contrato_tipo: ["renta_fija", "revenue_share", "mixto"],
      devolucion_estado: [
        "pendiente_devolucion",
        "recibida_ok",
        "recibida_con_diferencia",
      ],
      excepcion_motivo: [
        "ausencia_operador",
        "emergencia",
        "mantenimiento",
        "otro",
      ],
      incidencia_estado: ["abierta", "en_revision", "resuelta", "descartada"],
      incidencia_severidad: ["baja", "media", "alta"],
      incidencia_tipo: [
        "maquina_apagada",
        "sin_conexion_nayax",
        "tolva_atascada",
        "producto_compactado",
        "vandalismo",
        "falta_vasos",
        "producto_contaminado",
        "acceso_denegado",
        "queja_cliente",
        "cartucho_danado",
        "cartucho_perdido",
        "discrepancia_devolucion",
        "desviacion_calibracion",
        "otro",
      ],
      maquina_estado: ["operativa", "mantenimiento", "baja"],
      mov_presentacion: ["granel", "cartucho", "polvo_en_tolva", "vaso"],
      movimiento_tipo: [
        "recepcion",
        "encartuchado_salida_granel",
        "encartuchado_entrada_cartucho",
        "merma_encartuchado",
        "surtido_salida_cartucho",
        "devolucion_entrada_cartucho",
        "llenado_salida_cartucho",
        "llenado_entrada_tolva",
        "venta_salida_tolva",
        "merma_ruta",
        "ajuste_conteo_almacen",
        "ajuste_conteo_maquina",
        "ajuste_periodo_anterior",
        "ajuste_manual",
      ],
      oc_estado: ["borrador", "enviada", "parcial", "recibida", "cancelada"],
      producto_tipo: ["polvo", "vaso"],
      reporte_estado: [
        "en_generacion",
        "generado",
        "aprobado",
        "enviado",
        "error",
      ],
      surtido_estado: ["pendiente", "en_proceso", "completado"],
    },
  },
} as const
