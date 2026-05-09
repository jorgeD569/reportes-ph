/**
 * Errores del motor por valor inválido en input type="date" (no deben mostrarse al usuario).
 * Patrones anclados al inicio para no silenciar mensajes reales que contengan subcadenas similares.
 */
const BROWSER_DATE_RANGE = /^date\/time field value out of range/i
const CHROME_DATE_VALUE =
  /^the specified value .+ does not conform to the required format/i

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}

function shouldSilenceErrorMessage(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  if (BROWSER_DATE_RANGE.test(t)) return true
  if (CHROME_DATE_VALUE.test(t)) return true
  return false
}

/**
 * Mensaje listo para mostrar en UI; null = no mostrar alerta (error técnico del navegador).
 */
export function normalizeUserError(error: unknown): string | null {
  const raw = messageFromUnknown(error).trim()
  if (!raw) return 'Ocurrió un error. Volvé a intentar.'
  if (shouldSilenceErrorMessage(raw)) return null
  return raw
}
