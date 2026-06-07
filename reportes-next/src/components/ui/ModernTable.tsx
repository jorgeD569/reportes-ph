'use client'

import { useCoordinadorTheme } from '@/components/coordinador/CoordinadorThemeProvider'
import {
  COORD_TABLE,
  COORD_TABLE_WRAP,
  COORD_TD,
  COORD_TH,
  COORD_TR,
} from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'

export function ModernTable({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const isCoordinador = useCoordinadorTheme()

  return (
    <div
      className={cn(
        isCoordinador
          ? COORD_TABLE_WRAP
          : 'overflow-x-auto rounded-2xl border border-border',
        className
      )}
    >
      <table
        className={cn(
          isCoordinador ? COORD_TABLE : 'min-w-[900px] w-full border-collapse bg-surface'
        )}
      >
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
  const isCoordinador = useCoordinadorTheme()

  return (
    <th
      className={cn(
        isCoordinador
          ? COORD_TH
          : 'bg-surface-2 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted',
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
  const isCoordinador = useCoordinadorTheme()

  return (
    <td
      className={cn(
        isCoordinador ? COORD_TD : 'border-t border-border px-4 py-3 text-sm',
        className
      )}
      {...props}
    >
      {children}
    </td>
  )
}

export function Tr({
  className,
  children,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  className?: string
  selected?: boolean
}) {
  const isCoordinador = useCoordinadorTheme()

  return (
    <tr
      className={cn(
        isCoordinador
          ? cn(COORD_TR, selected && 'bg-sky-400/10')
          : 'border-t border-border transition-colors hover:bg-surface-2/60',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  )
}
