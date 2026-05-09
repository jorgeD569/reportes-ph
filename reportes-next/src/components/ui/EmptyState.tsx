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
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface-2 p-6 text-center',
        className
      )}
    >
      <div className="text-sm font-semibold">{title}</div>
      {description ? (
        <div className="mt-1 text-sm text-muted">{description}</div>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

