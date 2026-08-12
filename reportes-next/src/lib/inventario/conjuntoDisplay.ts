/**
 * Helpers de presentación para conjuntos (campo real: codigo_interno).
 * No inventan valores: solo etiquetas de vacío.
 */

export function displayCodigoInterno(
  v: string | null | undefined,
): string {
  const t = String(v ?? '').trim()
  return t === '' ? 'Sin código interno' : t
}

export function displayObservaciones(
  v: string | null | undefined,
): string {
  const t = String(v ?? '').trim()
  return t === '' ? 'Sin observaciones' : t
}

export function displayUbicacionConjunto(
  v: string | null | undefined,
): string {
  const t = String(v ?? '').trim()
  return t === '' ? 'Sin ubicación informada' : t
}

/** Ubicación visible de un conjunto: efectiva si viene, si no la propia. */
export function ubicacionVisibleConjunto(a: {
  ubicacion?: string | null
  ubicacion_efectiva?: string | null
}): string | null {
  const eff = String(a.ubicacion_efectiva ?? '').trim()
  if (eff) return eff
  const own = String(a.ubicacion ?? '').trim()
  return own === '' ? null : own
}

export function matchConjuntoQuery(
  a: {
    numero_serie?: string | null
    descripcion?: string | null
    ubicacion?: string | null
    marca?: string | null
    codigo_interno?: string | null
  },
  q: string,
): boolean {
  if (!q) return true
  const hay = [
    a.numero_serie,
    a.descripcion,
    a.ubicacion,
    a.marca,
    a.codigo_interno,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ')
  return hay.includes(q)
}

export const ADJUNTO_TITULOS: Record<string, string> = {
  foto_general: 'Foto general',
  foto_placa: 'Foto de placa',
  certificado: 'Certificado',
  otro: 'Otro archivo',
}

export function tituloAdjunto(tipo: string | null | undefined): string {
  const key = String(tipo || '')
    .trim()
    .toLowerCase()
  return ADJUNTO_TITULOS[key] || 'Archivo'
}

export function esAdjuntoPdf(adj: {
  mime_type?: string | null
  storage_path?: string | null
  tipo?: string | null
}): boolean {
  const mime = String(adj.mime_type || '').toLowerCase()
  const path = String(adj.storage_path || '').toLowerCase()
  return (
    mime.includes('pdf') ||
    path.endsWith('.pdf') ||
    adj.tipo === 'certificado'
  )
}

export function esAdjuntoImagen(adj: {
  mime_type?: string | null
  storage_path?: string | null
  tipo?: string | null
}): boolean {
  if (esAdjuntoPdf(adj)) return false
  const mime = String(adj.mime_type || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  const path = String(adj.storage_path || '').toLowerCase()
  return /\.(jpe?g|png|webp|gif|heic)$/i.test(path)
}

export function nombreArchivoAdjunto(adj: {
  storage_path?: string | null
  tipo?: string | null
}): string {
  const path = String(adj.storage_path || '').trim()
  if (path) {
    const parts = path.split('/')
    const last = parts[parts.length - 1]
    if (last) return last
  }
  return tituloAdjunto(adj.tipo)
}
