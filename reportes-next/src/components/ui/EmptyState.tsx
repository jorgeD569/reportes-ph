'use client'

import { useCoordinadorTheme } from '@/components/coordinador/CoordinadorThemeProvider'
import { COORD_EMPTY } from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'

export function EmptyState({
  title = 'Sin datos',
  description,
  action,
  className,
}: {
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  const isCoordinador = useCoordinadorTheme()

  return (
    <div
      className={cn(
        isCoordinador
          ? COORD_EMPTY
          : 'rounded-2xl border border-border bg-surface-2 p-6 text-center',
        className
      )}
    >
      <div className={cn('text-sm font-semibold', isCoordinador && 'text-white')}>{title}</div>
      {description ? (
        <div className={cn('mt-1 text-sm', isCoordinador ? 'text-slate-300' : 'text-muted')}>
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
