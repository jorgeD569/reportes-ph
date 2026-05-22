import type { ParteOperativoListItem } from '@/lib/types/partes-operativos'

const PDF_PATH_KEYS = [
  'pdf_path',
  'reporte_pdf_path',
  'parte_pdf_path',
  'parte_operativo_pdf_path',
] as const

/** Path de storage del PDF operativo (primer campo con valor). */
export function parteOperativoPdfPath(
  parte: ParteOperativoListItem & Record<string, unknown>
): string {
  for (const key of PDF_PATH_KEYS) {
    const v = parte[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** URL pública para abrir el PDF (prioriza pdf_url del API). */
export function parteOperativoPdfUrl(
  parte: ParteOperativoListItem & Record<string, unknown>
): string {
  if (typeof parte.pdf_url === 'string' && parte.pdf_url.trim()) {
    return parte.pdf_url.trim()
  }
  return ''
}

export function parteOperativoEstaCerrado(estado?: string | null): boolean {
  return String(estado || '').trim().toLowerCase() === 'cerrado'
}

export function parteOperativoTienePdf(
  parte: ParteOperativoListItem & Record<string, unknown>
): boolean {
  return Boolean(parteOperativoPdfUrl(parte) || parteOperativoPdfPath(parte))
}
