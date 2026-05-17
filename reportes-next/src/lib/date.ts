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
 * ISO fecha (YYYY-MM-DD o prefijo de ISO) o dd/mm/aaaa en calendario local.
 */
export function parsePlainOrDisplayDateToLocalDate(
  input: string | null | undefined
): Date | null {
  if (input == null || input === '') return null
  const s = String(input).trim()
  return parseLocalDate(s) ?? parseLocalDate(s.slice(0, 10)) ?? parseDdMmYyyySlash(s)
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

  const fromPlain = parseLocalDate(s) ?? parseLocalDate(s.slice(0, 10))
  if (fromPlain) {
    const out = toIsoLocalDateString(fromPlain)
    return ISO_DATE_RE.test(out) ? out : ''
  }

  const fromSlash = parseDdMmYyyySlash(s)
  if (fromSlash) {
    const out = toIsoLocalDateString(fromSlash)
    return ISO_DATE_RE.test(out) ? out : ''
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
    return formatLocalDateDdMmYyyy(input)
  }
  const s = String(input).trim()
  const plain = parseLocalDate(s) ?? parseLocalDate(s.slice(0, 10))
  if (plain) return formatLocalDateDdMmYyyy(plain)

  const slash = parseDdMmYyyySlash(s)
  if (slash) return formatLocalDateDdMmYyyy(slash)

  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return formatLocalDateDdMmYyyy(d)
}

/** Alias de `toDisplayDate` (misma firma y comportamiento). */
export const formatDateDDMMYYYY = toDisplayDate

/** Solo día dd/mm/aaaa para fechas de calendario (sin hora ni desfase TZ en YYYY-MM-DD). */
export function formatFechaSoloDia(fecha?: string | null): string {
  if (!fecha) return '—'
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
    const [year, month, day] = fecha.slice(0, 10).split('-')
    return `${day}/${month}/${year}`
  }
  const displayed = toDisplayDate(fecha)
  return displayed || String(fecha)
}

/** Fecha+hora locales en español Argentina (valor es instantáneo ISO u otro con zona). */
export function formatDateTimeEsAr(input: string | Date | null | undefined): string {
  if (!input) return ''
  const d = input instanceof Date ? input : new Date(String(input))
  if (Number.isNaN(d.getTime())) return String(input)
  return d.toLocaleString('es-AR')
}
