import type { VencimientoState } from '@/lib/vencimientos'

export type ReportePhState = 'pendiente_grafico' | 'con_grafico' | 'pdf_generado'

export function reportePhState(input: {
  wika_image_path?: string | null
  reporte_pdf_path?: string | null
}): ReportePhState {
  if (input.reporte_pdf_path) return 'pdf_generado'
  if (input.wika_image_path) return 'con_grafico'
  return 'pendiente_grafico'
}

export function reportePhStateLabel(state: ReportePhState) {
  switch (state) {
    case 'pdf_generado':
      return 'PDF generado'
    case 'con_grafico':
      return 'Con gráfico cargado'
    case 'pendiente_grafico':
      return 'Pendiente de gráfico'
  }
}

export type ParteOperativoListState =
  | 'abierto'
  | 'pendiente_cierre'
  | 'cerrado'
  | 'pdf_generado'

export function parteOperativoListState(
  input: {
    estado?: string | null
    pdf_path?: string | null
    pdf_url?: string | null
    reporte_pdf_path?: string | null
    parte_pdf_path?: string | null
    parte_operativo_pdf_path?: string | null
  } & Record<string, unknown>
): ParteOperativoListState {
  const pdfKeys = [
    'pdf_url',
    'pdf_path',
    'reporte_pdf_path',
    'parte_pdf_path',
    'parte_operativo_pdf_path',
  ] as const

  const tienePdf = pdfKeys.some((key) => {
    const v = input[key]
    return typeof v === 'string' && v.trim().length > 0
  })

  if (tienePdf) return 'pdf_generado'

  const estado = String(input.estado || '').trim().toLowerCase()
  if (estado === 'cerrado') return 'pdf_generado'
  if (estado === 'abierto') return 'abierto'
  return 'pendiente_cierre'
}

export function parteOperativoListStateLabel(state: ParteOperativoListState) {
  switch (state) {
    case 'pdf_generado':
      return 'PDF generado'
    case 'cerrado':
      return 'Cerrado'
    case 'abierto':
      return 'Abierto / En carga'
    case 'pendiente_cierre':
      return 'Pendiente de cierre'
  }
}

export function parteOperativoListStateVariant(
  state: ParteOperativoListState
): 'success' | 'info' | 'warning' | 'neutral' {
  switch (state) {
    case 'pdf_generado':
      return 'success'
    case 'cerrado':
      return 'info'
    case 'abierto':
      return 'warning'
    case 'pendiente_cierre':
      return 'neutral'
  }
}

export function vencimientoLabel(state: VencimientoState, days: number | null) {
  if (state === 'sin_fecha') return '-'
  if (state === 'vencido') return 'Vencido'
  if (days === null) return '-'
  return `${days} días`
}

