import { cn } from '@/lib/cn'

export function ModernTable({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-border', className)}>
      <table className="min-w-[900px] w-full border-collapse bg-surface">
        {children}
      </table>
    </div>
  )
}

export function Th({
  className,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { className?: string }) {
  return (
    <th
      className={cn(
        'bg-surface-2 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted',
        className
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({
  className,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { className?: string }) {
  return (
    <td
      className={cn('border-t border-border px-4 py-3 text-sm', className)}
      {...props}
    >
      {children}
    </td>
  )
}

