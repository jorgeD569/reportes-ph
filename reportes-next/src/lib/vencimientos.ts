import { parsePlainOrDisplayDateToLocalDate } from '@/lib/date'

export type VencimientoState = 'vencido' | 'critico' | 'proximo' | 'ok' | 'sin_fecha'

/** Normaliza a medianoche del día local en calendario. */
function startOfLocalCalendarDay(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate())
}

export function daysUntil(dateInput: string | Date | null | undefined): number | null {
  if (!dateInput) return null

  let targetCalendar: Date

  if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) return null
    targetCalendar = startOfLocalCalendarDay(dateInput)
  } else {
    const s = String(dateInput).trim()
    const parsed = parsePlainOrDisplayDateToLocalDate(s)
    if (parsed) {
      targetCalendar = startOfLocalCalendarDay(parsed)
    } else {
      const d = new Date(s)
      if (Number.isNaN(d.getTime())) return null
      targetCalendar = startOfLocalCalendarDay(d)
    }
  }

  const today = startOfLocalCalendarDay(new Date())

  return Math.ceil((targetCalendar.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function vencimientoState(
  dateInput: string | Date | null | undefined,
  thresholds = { criticoDays: 7, proximoDays: 30 }
): { state: VencimientoState; days: number | null } {
  const days = daysUntil(dateInput)
  if (days === null) return { state: 'sin_fecha', days: null }
  if (days < 0) return { state: 'vencido', days }
  if (days <= thresholds.criticoDays) return { state: 'critico', days }
  if (days <= thresholds.proximoDays) return { state: 'proximo', days }
  return { state: 'ok', days }
}
