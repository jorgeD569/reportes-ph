import { cn } from '@/lib/cn'

export function Card({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-[var(--radius-app)] border border-border bg-surface shadow-[var(--shadow-app)]',
        className
      )}
    >
      {children}
    </section>
  )
}

export function CardHeader({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 p-5', className)}>
      {children}
    </div>
  )
}

export function CardBody({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>
}

