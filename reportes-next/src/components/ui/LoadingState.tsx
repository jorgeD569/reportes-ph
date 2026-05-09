import { cn } from '@/lib/cn'

export function LoadingState({
  label = 'Cargando…',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-6',
        className
      )}
    >
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-transparent" />
      <div className="text-sm text-muted">{label}</div>
    </div>
  )
}

