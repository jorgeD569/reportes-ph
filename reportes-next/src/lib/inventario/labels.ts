/** Etiquetas en español para inventario / activos compuestos. */

export const ESTADO_OPERATIVO_LABELS: Record<string, string> = {
  operativo: 'Operativo',
  'fuera de servicio': 'Fuera de servicio',
  fuera_de_servicio: 'Fuera de servicio',
  'en reparacion': 'En reparación',
  en_reparacion: 'En reparación',
  vencido: 'Vencido',
  baja: 'Baja',
}

export const CATEGORIA_LABELS: Record<string, string> = {
  unidad: 'Unidad',
  wika: 'WIKA',
  linea: 'Línea / accesorio',
  herramienta: 'Herramienta',
  seguridad: 'Seguridad',
  otro: 'Otro',
  'unidad ph': 'Unidad PH',
  'sensor wika': 'Sensor WIKA',
  'línea / accesorio': 'Línea / accesorio',
  'linea / accesorio': 'Línea / accesorio',
  piletas: 'Piletas',
}

export type ActivoTipoBadgeKind = 'manifold' | 'componente' | 'individual'

export function normalizeEstadoKey(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
}

export function labelEstadoOperativo(raw: string | null | undefined): string {
  const s = String(raw || '').trim()
  if (!s) return '—'
  const key = s.toLowerCase()
  const spaced = normalizeEstadoKey(s)
  return ESTADO_OPERATIVO_LABELS[key] || ESTADO_OPERATIVO_LABELS[spaced] || s
}

/** Etiqueta de revisión / vigencia (no confundir con estado operativo). */
export function labelEstadoRevisionBusqueda(opts: {
  estado_revision?: string | null
  activo?: boolean | null
}): string {
  const rev = String(opts.estado_revision || '')
    .trim()
    .toLowerCase()
  if (rev === 'pendiente') return 'Pendiente de revisión'
  if (rev === 'rechazado') return 'Rechazado'
  if (opts.activo === false) return 'Inactivo'
  if (rev === 'aprobado') return 'Aprobado'
  return rev || '—'
}

export function variantEstadoRevisionBusqueda(opts: {
  estado_revision?: string | null
  activo?: boolean | null
}): 'warning' | 'danger' | 'neutral' | 'success' {
  const rev = String(opts.estado_revision || '')
    .trim()
    .toLowerCase()
  if (rev === 'pendiente') return 'warning'
  if (rev === 'rechazado') return 'danger'
  if (opts.activo === false) return 'neutral'
  if (rev === 'aprobado') return 'success'
  return 'neutral'
}

export function labelCategoria(
  raw: string | null | undefined,
  nombrePreferido?: string | null,
): string {
  const preferred = String(nombrePreferido || '').trim()
  if (preferred) return preferred
  const s = String(raw || '').trim()
  if (!s) return '—'
  // Fallback histórico: si llega un codigo_legacy conocido, mostrar etiqueta amigable.
  // Los selectores NO usan este mapa; solo display de datos viejos.
  const key = s.toLowerCase()
  return CATEGORIA_LABELS[key] || s
}

export function resolveActivoTipoBadge(opts: {
  esConjunto?: boolean | null
  esComponente?: boolean | null
}): ActivoTipoBadgeKind {
  if (opts.esConjunto === true) return 'manifold'
  if (opts.esComponente === true) return 'componente'
  return 'individual'
}

export function labelActivoTipoBadge(kind: ActivoTipoBadgeKind): string {
  if (kind === 'manifold') return 'Conjunto'
  if (kind === 'componente') return 'Componente'
  return 'Individual'
}

export function newClientUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

