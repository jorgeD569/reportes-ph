'use client'

import { useCoordinadorTheme } from '@/components/coordinador/CoordinadorThemeProvider'
import { COORD_SUBTITLE, COORD_TITLE } from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'

export function PageHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  className?: string
}) {
  const isCoordinador = useCoordinadorTheme()

  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1
          className={cn(
            isCoordinador
              ? COORD_TITLE
              : 'text-2xl font-semibold tracking-tight text-app md:text-3xl'
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className={cn(
              isCoordinador ? COORD_SUBTITLE : 'mt-1 text-sm text-muted md:text-base'
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="flex min-w-0 shrink-0 items-center gap-2">{right}</div> : null}
    </header>
  )
}
