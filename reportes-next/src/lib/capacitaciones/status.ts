import type { CapacitacionEstadoAsignacion } from '@/lib/types/capacitaciones'

export function asignacionEstadoLabel(estado: CapacitacionEstadoAsignacion): string {
  switch (estado) {
    case 'pendiente':
      return 'Pendiente'
    case 'realizada':
      return 'Realizada'
    case 'vencida':
      return 'Vencida'
    default:
      return estado
  }
}

export function asignacionEstadoVariant(
  estado: CapacitacionEstadoAsignacion
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' {
  switch (estado) {
    case 'pendiente':
      return 'warning'
    case 'realizada':
      return 'success'
    case 'vencida':
      return 'danger'
    default:
      return 'neutral'
  }
}
