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
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-app md:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted md:text-base">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="flex min-w-0 shrink-0 items-center gap-2">{right}</div> : null}
    </header>
  )
}

