/** Reglas alineadas con GET /busqueda-global (mín. 2 chars; numéricos desde 1 dígito). */
export function isValidGlobalSearchQuery(raw: string): boolean {
  const q = String(raw ?? '').trim()
  if (!q) return false
  if (/^\d+$/.test(q)) return true
  return q.length >= 2
}

export function normalizeGlobalSearchQuery(raw: string): string {
  return String(raw ?? '').trim()
}

export function pathFromHref(href: string): string {
  const raw = String(href ?? '').trim()
  if (!raw) return '/'
  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).pathname || '/'
    }
  } catch {
    /* ignore */
  }
  return raw.split('?')[0] || '/'
}

export function isExactMatchQuery(
  query: string,
  candidate: string | number | null | undefined,
): boolean {
  const q = String(query ?? '').trim()
  const c = String(candidate ?? '').trim()
  if (!q || !c) return false
  return q.toLowerCase() === c.toLowerCase()
}
