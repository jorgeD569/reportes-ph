'use client'

import { useCoordinadorTheme } from '@/components/coordinador/CoordinadorThemeProvider'
import { cn } from '@/lib/cn'

type Variant =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'accent'

const defaultStyles: Record<Variant, string> = {
  neutral: 'bg-surface-2 text-app border-border',
  info: 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:border-sky-900/60',
  success:
    'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900/60',
  warning:
    'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900/60',
  danger:
    'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:border-rose-900/60',
  accent:
    'bg-orange-50 text-orange-900 border-orange-200 dark:bg-orange-950/40 dark:text-orange-100 dark:border-orange-900/60',
}

const coordinadorStyles: Record<Variant, string> = {
  neutral: 'border-slate-600 bg-slate-800/80 text-white',
  info: 'border-sky-400/40 bg-sky-500/20 text-white',
  success: 'border-emerald-400/40 bg-emerald-500/20 text-white',
  warning: 'border-amber-400/40 bg-amber-500/20 text-white',
  danger: 'border-rose-400/40 bg-rose-500/20 text-white',
  accent: 'border-orange-400/40 bg-orange-500/20 text-white',
}

export function StatusBadge({
  children,
  variant = 'neutral',
  className,
}: {
  children: React.ReactNode
  variant?: Variant
  className?: string
}) {
  const isCoordinador = useCoordinadorTheme()

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide',
        isCoordinador ? coordinadorStyles[variant] : defaultStyles[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
