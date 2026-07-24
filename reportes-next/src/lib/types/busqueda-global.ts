export type BusquedaGlobalActivo = {
  tipo: 'activo'
  id: string | number
  titulo: string
  subtitulo: string
  es_conjunto: boolean
  es_componente: boolean
  /** Flag de inventario (activo=false ⇒ inactivo / baja administrativa). */
  activo: boolean
  /** Estado de revisión del relevamiento. */
  estado_revision: 'pendiente' | 'aprobado' | 'rechazado' | string | null
  /** Estado operativo real (operativo, fuera de servicio, etc.). */
  estado: string | null
  ubicacion_propia: string | null
  ubicacion_efectiva: string | null
  pertenencia_actual: {
    conjunto_id: string | number
    numero_serie: string | null
    descripcion: string | null
    ubicacion: string | null
  } | null
  url_destino: string
}

export type BusquedaGlobalParteOperativo = {
  tipo: 'parte_operativo'
  id: string
  numero_parte: number | string | null
  titulo: string
  fecha: string | null
  pozo: string | null
  operadora: string | null
  yacimiento: string | null
  estado: string | null
  pdf_url: string | null
  url_destino: string
}

export type BusquedaGlobalReportePh = {
  tipo: 'reporte_ph'
  id: string
  reporte_numero: number | string | null
  titulo: string
  fecha: string | null
  cliente: string | null
  pozo: string | null
  elemento_ensayar: string | null
  pdf_url: string | null
  url_destino: string
}

export type GetBusquedaGlobalResponse = {
  ok: boolean
  query: string
  total: number
  resultados: {
    activos: BusquedaGlobalActivo[]
    partes_operativos: BusquedaGlobalParteOperativo[]
    reportes_ph: BusquedaGlobalReportePh[]
  }
  error?: string
  code?: string
}

