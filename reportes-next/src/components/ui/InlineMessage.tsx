'use client'

import { useCoordinadorTheme } from '@/components/coordinador/CoordinadorThemeProvider'
import { cn } from '@/lib/cn'

type Kind = 'info' | 'success' | 'warning' | 'error'

function defaultStyles(kind: Kind) {
  switch (kind) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-50'
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-50'
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-50'
    case 'info':
    default:
      return 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-50'
  }
}

function coordinadorStyles(kind: Kind) {
  switch (kind) {
    case 'success':
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
    case 'warning':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-100'
    case 'error':
      return 'border-rose-400/30 bg-rose-500/10 text-rose-100'
    case 'info':
    default:
      return 'border-sky-400/30 bg-sky-500/10 text-sky-100'
  }
}

export function InlineMessage({
  kind = 'info',
  title,
  description,
  className,
}: {
  kind?: Kind
  title: string
  description?: string
  className?: string
}) {
  const isCoordinador = useCoordinadorTheme()

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 text-sm shadow-[var(--shadow-app)]',
        isCoordinador ? coordinadorStyles(kind) : defaultStyles(kind),
        className
      )}
    >
      <div className="font-semibold">{title}</div>
      {description ? <div className="mt-1 opacity-80">{description}</div> : null}
    </div>
  )
}
