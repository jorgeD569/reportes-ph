import type { ParteOperativoListItem } from '@/lib/types/partes-operativos'

export type ParteOperativoServicioRow = {
  id?: string
  parte_id?: string
  codigo_servicio?: string | null
  linea?: string | null
  pos?: string | null
  descripcion?: string | null
  cantidad?: number | null
  observaciones?: string | null
}

export type ParteOperativoPhVinculo = {
  id?: string
  parte_operativo_id?: string
  reporte_ph_id?: string
  reporte_numero?: string | number | null
  tipo_prueba?: string | null
  elemento_ensayar?: string | null
  valvula?: string | null
  resultado_ensayo?: string | null
  estado?: string | null
  reporte_pdf_path?: string | null
}

export type HistorialParteOperativo = {
  id: string
  parte_id: string
  created_at: string
  usuario?: string | null
  accion: string
  motivo: string
  estado_anterior?: string | null
  estado_nuevo?: string | null
  datos_modificados?: Record<string, unknown> | null
}

export type ParteOperativoDetalle = ParteOperativoListItem & {
  salida_desde?: string | null
  km?: string | null
  supervisor_operativo?: string | null
  operador_1?: string | null
  operador_2?: string | null
  operador_3?: string | null
  observaciones?: string | null
  updated_at?: string | null
}

export type GetParteOperativoDetalleResponse = {
  ok?: boolean
  parte: ParteOperativoDetalle
  servicios?: ParteOperativoServicioRow[]
  pruebas_ph?: ParteOperativoPhVinculo[]
  historial?: HistorialParteOperativo[]
  error?: string
}

export type PutParteOperativoAdminResponse = {
  ok?: boolean
  parte?: ParteOperativoDetalle
  error?: string
}

export type PostServiciosAdminResponse = {
  ok?: boolean
  servicios?: ParteOperativoServicioRow[]
  error?: string
}

export type ReabrirParteResponse = {
  ok?: boolean
  parte?: ParteOperativoDetalle
  error?: string
}
