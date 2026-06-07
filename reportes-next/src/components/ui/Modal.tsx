'use client'

import * as React from 'react'
import { useCoordinadorTheme } from '@/components/coordinador/CoordinadorThemeProvider'
import {
  COORD_MODAL,
  COORD_MODAL_FOOTER,
  COORD_MODAL_HEADER,
} from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  bodyClassName,
  footerClassName,
  headerClassName,
  maxWidthClassName = 'max-w-2xl',
  compact = false,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  bodyClassName?: string
  footerClassName?: string
  headerClassName?: string
  maxWidthClassName?: string
  /** Layout compacto: max-height 85vh, body scrollable y footer fijo. */
  compact?: boolean
}) {
  const isCoordinador = useCoordinadorTheme()

  React.useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const useCoordDefaults = isCoordinador && !className

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-app)]',
          useCoordDefaults
            ? COORD_MODAL
            : 'border-border bg-surface',
          compact && 'max-h-[85vh]',
          maxWidthClassName,
          className
        )}
      >
        {title ? (
          <div
            className={cn(
              'flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3',
              useCoordDefaults ? COORD_MODAL_HEADER : 'border-border',
              headerClassName
            )}
          >
            <div className="text-sm font-semibold">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'rounded-lg px-2 py-1 text-sm hover:bg-white/10',
                useCoordDefaults ? 'text-sky-200/70' : 'text-muted hover:bg-surface-2 hover:text-app'
              )}
            >
              ×
            </button>
          </div>
        ) : null}
        <div
          className={cn(
            compact ? 'min-h-0 flex-1 overflow-y-auto' : '',
            'px-4 py-3',
            bodyClassName
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              'shrink-0 border-t px-4 py-3',
              useCoordDefaults
                ? COORD_MODAL_FOOTER
                : 'border-border bg-surface-2',
              footerClassName
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
