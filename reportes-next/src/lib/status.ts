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

export function vencimientoLabel(state: VencimientoState, days: number | null) {
  if (state === 'sin_fecha') return '-'
  if (state === 'vencido') return 'Vencido'
  if (days === null) return '-'
  return `${days} días`
}

