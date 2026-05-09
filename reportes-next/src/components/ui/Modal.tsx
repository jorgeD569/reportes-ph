'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  React.useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow-app)]',
          className
        )}
      >
        {title ? (
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div className="text-sm font-semibold">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-app"
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-border bg-surface-2 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

