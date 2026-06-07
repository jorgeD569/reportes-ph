'use client'

import { useCoordinadorTheme } from '@/components/coordinador/CoordinadorThemeProvider'
import { COORD_DATA_FIELD, COORD_LABEL, COORD_TEXT_SOFT } from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'

export function DataField({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  const isCoordinador = useCoordinadorTheme()

  return (
    <div
      className={cn(
        isCoordinador
          ? COORD_DATA_FIELD
          : 'min-w-0 rounded-2xl border border-border bg-surface-2 p-4',
        className
      )}
    >
      <div
        className={cn(
          isCoordinador
            ? COORD_LABEL
            : 'text-xs font-semibold uppercase tracking-wide text-muted'
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'mt-1 break-words text-sm font-semibold',
          isCoordinador ? COORD_TEXT_SOFT : 'text-app'
        )}
      >
        {value ?? (
          <span className={cn('font-medium', isCoordinador ? 'text-sky-200/50' : 'text-muted')}>
            Sin dato
          </span>
        )}
      </div>
    </div>
  )
}
