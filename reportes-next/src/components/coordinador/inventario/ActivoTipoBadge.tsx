'use client'

import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  labelActivoTipoBadge,
  resolveActivoTipoBadge,
  type ActivoTipoBadgeKind,
} from '@/lib/inventario/labels'

const VARIANT: Record<ActivoTipoBadgeKind, 'accent' | 'warning' | 'neutral'> = {
  manifold: 'accent',
  componente: 'warning',
  individual: 'neutral',
}

export function ActivoTipoBadge({
  esConjunto,
  esComponente,
  className,
}: {
  esConjunto?: boolean | null
  /** Del contrato GET /activos; no inferir ni consultar por fila. */
  esComponente?: boolean | null
  className?: string
}) {
  const kind = resolveActivoTipoBadge({ esConjunto, esComponente })
  return (
    <StatusBadge variant={VARIANT[kind]} className={className}>
      {labelActivoTipoBadge(kind)}
    </StatusBadge>
  )
}

