export type ReportePhListItem = {
  id: string
  reporte_numero: string | null
  fecha: string | null
  cliente: string | null
  pozo: string | null
  elemento_ensayar: string | null
  wika_image_path: string | null
  reporte_pdf_path: string | null
  created_at: string | null
  estado?: string | null
}

export type GetReportesPhResponse = {
  ok: boolean
  reportes: ReportePhListItem[]
}

export type Parte = Record<string, unknown> & {
  id: string
  reporte_numero?: string | null
  fecha?: string | null
  cliente?: string | null
  pozo?: string | null
  elemento_ensayar?: string | null
  tipo_prueba?: string | null
  wika_image_path?: string | null
  reporte_pdf_path?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type GetReportePhDetalleResponse = {
  ok: boolean
  parte: Parte
}

export type PostSubirWikaRequest = {
  parte_id: string
  image_base64: string
  file_name?: string
  mime_type?: string
}

export type PostSubirWikaResponse = {
  ok: boolean
  path: string
  url: string
}

export type PostGenerarReporteRequest = {
  parte_id: string
}

export type PostGenerarReporteResponse =
  | { ok: true; url: string; mail?: unknown; reporte_pdf_path?: string }
  | { message: string; reporte_pdf_path: string; reporte_pdf_url: string }

