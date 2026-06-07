'use client'

import { useCoordinadorTheme } from '@/components/coordinador/CoordinadorThemeProvider'
import { COORD_LOADING } from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'

export function LoadingState({
  label = 'Cargando…',
  className,
}: {
  label?: string
  className?: string
}) {
  const isCoordinador = useCoordinadorTheme()

  return (
    <div
      className={cn(
        isCoordinador
          ? COORD_LOADING
          : 'flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-6',
        className
      )}
    >
      {!isCoordinador ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-transparent" />
      ) : null}
      <div className={cn('text-sm', isCoordinador ? '' : 'text-muted')}>{label}</div>
    </div>
  )
}
