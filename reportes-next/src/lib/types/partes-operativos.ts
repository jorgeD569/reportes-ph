export type ParteOperativoListItem = {
  id: string
  numero_parte?: number | string | null
  fecha?: string | null
  pozo?: string | null
  yacimiento?: string | null
  operadora?: string | null
  contratista?: string | null
  unidad?: string | null
  unidad_pesada?: string | null
  estado?: string | null
  pdf_path?: string | null
  pdf_url?: string | null
  reporte_pdf_path?: string | null
  parte_pdf_path?: string | null
  parte_operativo_pdf_path?: string | null
  finalizado_at?: string | null
  created_at?: string | null
}

export type GetPartesOperativosResponse = {
  ok?: boolean
  partes?: ParteOperativoListItem[]
  error?: string
}

export type CerrarParteOperativoResponse = {
  ok?: boolean
  pdf_url?: string
  error?: string
}
