/** Zona horaria operativa del cPanel / inventario (no restar horas a mano). */
export const TZ_OPERATIVA_AR = 'America/Argentina/Buenos_Aires'

/** Fecha calendario pura YYYY-MM-DD (sin hora). */
export function isPureCalendarDate(value: string | null | undefined): boolean {
  if (value == null) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())
}

/** ISO / timestamptz con componente horario (no es date puro). */
export function hasInstantTimeComponent(value: string | null | undefined): boolean {
  if (value == null) return false
  const s = String(value).trim()
  return /T\d{2}:\d{2}/.test(s) || /\s\d{2}:\d{2}(:\d{2})?/.test(s)
}

function toValidDate(input: string | Date | null | undefined): Date | null {
  if (input == null || input === '') return null
  const d = input instanceof Date ? input : new Date(String(input).trim())
  if (Number.isNaN(d.getTime())) return null
  return d
}

function formatInstanteEnAr(
  input: string | Date | null | undefined,
  withTime: boolean
): string {
  const d = toValidDate(input)
  if (!d) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ_OPERATIVA_AR,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime
      ? ({ hour: '2-digit', minute: '2-digit', hour12: false } as const)
      : {}),
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  const fecha = `${get('day')}/${get('month')}/${get('year')}`
  if (!withTime) return fecha
  return `${fecha} ${get('hour')}:${get('minute')}`
}

/**
 * Día calendario de un timestamptz / ISO con hora en America/Argentina/Buenos_Aires.
 * No usar para columnas `date` puras (YYYY-MM-DD).
 */
export function formatTimestamptzDiaAR(
  input: string | Date | null | undefined
): string {
  const out = formatInstanteEnAr(input, false)
  return out || '—'
}

/**
 * Fecha+hora de un timestamptz / ISO en America/Argentina/Buenos_Aires → dd/MM/yyyy HH:mm.
 */
export function formatTimestamptzFechaHoraAR(
  input: string | Date | null | undefined
): string {
  const out = formatInstanteEnAr(input, true)
  return out || '—'
}

/**
 * Parsea una fecha "plana" YYYY-MM-DD como calendario local (medianoche local).
 * Evita `new Date("YYYY-MM-DD")`, que JS interpreta como UTC y puede mostrar el día anterior en AR.
 *
 * Retorna null si el string no es exactamente fecha calendario válida YYYY-MM-DD.
 */
export function parseLocalDate(dateString: string | null | undefined): Date | null {
  if (dateString == null || dateString === '') return null
  const s = String(dateString).trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

/**
 * dd/mm/aaaa o d/m/aaaa (vencimiento legacy / texto).
 * Nunca usar `new Date("dd/mm/aaaa")` — el resultado depende del motor y locale.
 */
export function parseDdMmYyyySlash(s: string | null | undefined): Date | null {
  if (s == null || s === '') return null
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s).trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

/**
 * ISO fecha (YYYY-MM-DD) o dd/mm/aaaa en calendario local.
 * No toma el prefijo UTC de un timestamptz (YYYY-MM-DDTHH:mm…Z).
 */
export function parsePlainOrDisplayDateToLocalDate(
  input: string | null | undefined
): Date | null {
  if (input == null || input === '') return null
  const s = String(input).trim()
  if (hasInstantTimeComponent(s)) return null
  return parseLocalDate(s) ?? parseDdMmYyyySlash(s)
}

/** Fecha de hoy en calendario local (YYYY-MM-DD), sin `toISOString()` (evita desfase TZ). */
export function getFechaLocalHoy(): string {
  const hoy = new Date()
  const year = hoy.getFullYear()
  const month = String(hoy.getMonth() + 1).padStart(2, '0')
  const day = String(hoy.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** YYYY-MM-DD en calendario local (para `<input type="date">`). */
function toIsoLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function formatLocalDateDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/**
 * Valor exclusivo para `<input type="date">`: siempre YYYY-MM-DD o cadena vacía.
 * Algunos navegadores devuelven `dd/mm/aaaa` en `onChange`; aquí se normaliza a ISO.
 */
export function toInputDate(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  const s = String(value).trim()

  // Solo date puro o dd/mm/aaaa. No cortar timestamptz con slice(0,10).
  const fromPlain = isPureCalendarDate(s) ? parseLocalDate(s) : null
  if (fromPlain) {
    const out = toIsoLocalDateString(fromPlain)
    return ISO_DATE_RE.test(out) ? out : ''
  }

  const fromSlash = parseDdMmYyyySlash(s)
  if (fromSlash) {
    const out = toIsoLocalDateString(fromSlash)
    return ISO_DATE_RE.test(out) ? out : ''
  }

  // Compat: date serializado como medianoche ISO sin intención de instante → día del prefijo.
  // Solo si es exactamente T00:00:00(.000)?Z (típico de columnas date).
  const midnightUtc = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?Z$/i.exec(s)
  if (midnightUtc) {
    const fromMid = parseLocalDate(midnightUtc[1])
    if (fromMid) {
      const out = toIsoLocalDateString(fromMid)
      return ISO_DATE_RE.test(out) ? out : ''
    }
  }

  return ''
}

/**
 * Fecha de persistencia (Supabase / API): siempre `YYYY-MM-DD` o cadena vacía.
 * No mezclar con formato visual: en UI usar `toDisplayDate`.
 * Acepta ISO plano, prefijo de ISO, dd/mm/aaaa (strings) o `Date` (día local del instante).
 */
export function toBackendDate(input: string | Date | null | undefined): string {
  if (input == null || input === '') return ''
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return ''
    return toIsoLocalDateString(
      new Date(input.getFullYear(), input.getMonth(), input.getDate())
    )
  }
  return toInputDate(input)
}

/**
 * Formato visual dd/mm/aaaa (texto, tablas, labels).
 * Para strings estrictamente YYYY-MM-DD usa calendario local (sin TZ UTC).
 * Para instancias Date y otros strings (ej. ISO con tiempo) usa el día local de ese instante.
 */
export function toDisplayDate(input: string | Date | null | undefined): string {
  if (input == null || input === '') return ''
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return ''
    return formatInstanteEnAr(input, false) || formatLocalDateDdMmYyyy(input)
  }
  const s = String(input).trim()
  if (isPureCalendarDate(s)) {
    const plain = parseLocalDate(s)
    if (plain) return formatLocalDateDdMmYyyy(plain)
  }

  const slash = parseDdMmYyyySlash(s)
  if (slash) return formatLocalDateDdMmYyyy(slash)

  if (hasInstantTimeComponent(s)) {
    return formatInstanteEnAr(s, false) || s
  }

  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return formatInstanteEnAr(d, false) || formatLocalDateDdMmYyyy(d)
}

/** Alias de `toDisplayDate` (misma firma y comportamiento). */
export const formatDateDDMMYYYY = toDisplayDate

/**
 * Fecha calendario en formato argentino (DD/MM/AAAA) para UI.
 * No usar para persistencia ni `<input type="date">` (mantener ISO internamente).
 */
export function formatFechaAR(fecha: string | null | undefined): string {
  if (!fecha) return '-'

  const s = String(fecha).trim()
  if (hasInstantTimeComponent(s)) {
    const ar = formatTimestamptzDiaAR(s)
    return ar === '—' ? '-' : ar
  }

  const local = parsePlainOrDisplayDateToLocalDate(s)
  if (local) {
    return formatLocalDateDdMmYyyy(local)
  }

  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '-'

  return formatInstanteEnAr(d, false) || '-'
}

/** Fecha u hora para UI inventario: date puro → DD/MM/AAAA; timestamptz → dd/MM/yyyy HH:mm (AR). */
export function formatInventarioFechaDisplay(fecha: string | null | undefined): string {
  if (!fecha) return '—'
  const t = String(fecha).trim()
  if (!t) return '—'
  if (hasInstantTimeComponent(t)) {
    return formatTimestamptzFechaHoraAR(t)
  }
  const fmt = formatFechaAR(t)
  return fmt === '-' ? '—' : fmt
}

/**
 * Solo día dd/mm/aaaa.
 * - date puro YYYY-MM-DD: sin conversión TZ (calendario tal cual).
 * - timestamptz / ISO con hora: día en America/Argentina/Buenos_Aires.
 */
export function formatFechaSoloDia(fecha?: string | null): string {
  if (!fecha) return '—'
  const s = String(fecha).trim()
  if (isPureCalendarDate(s)) {
    const [year, month, day] = s.split('-')
    return `${day}/${month}/${year}`
  }
  if (hasInstantTimeComponent(s)) {
    return formatTimestamptzDiaAR(s)
  }
  const displayed = toDisplayDate(s)
  return displayed || String(fecha)
}

/** Fecha+hora en America/Argentina/Buenos_Aires → dd/MM/yyyy HH:mm. */
export function formatDateTimeEsAr(input: string | Date | null | undefined): string {
  if (!input) return ''
  const out = formatInstanteEnAr(input, true)
  return out || (typeof input === 'string' ? input : '')
}
