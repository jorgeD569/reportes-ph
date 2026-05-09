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
  return (
    <div className={cn('rounded-2xl border border-border bg-surface-2 p-4', className)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-semibold text-app">
        {value ?? <span className="font-medium text-muted">Sin dato</span>}
      </div>
    </div>
  )
}

