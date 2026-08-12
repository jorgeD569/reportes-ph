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
  subtitle,
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
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  bodyClassName?: string
  footerClassName?: string
  headerClassName?: string
  maxWidthClassName?: string
  /** Layout viewport: header/footer fijos, scroll solo en body. */
  compact?: boolean
}) {
  const isCoordinador = useCoordinadorTheme()
  const panelRef = React.useRef<HTMLDivElement>(null)
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const previouslyFocused = React.useRef<HTMLElement | null>(null)
  const onCloseRef = React.useRef(onClose)
  onCloseRef.current = onClose

  React.useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null

    // Siempre abrir mostrando el encabezado (no conservar scroll previo).
    if (bodyRef.current) bodyRef.current.scrollTop = 0

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    // Enfocar el panel/cerrar SOLO al abrir el modal (open → true).
    // No depende de `onClose`: si el padre pasa () => ... inline, cada tecla
    // recreaba onClose, re-ejecutaba este efecto y robaba el foco del input.
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = 0
      const closeBtn = panelRef.current?.querySelector<HTMLElement>(
        '[data-modal-close]',
      )
      const active = document.activeElement as HTMLElement | null
      const focusAlreadyInside =
        active && panelRef.current?.contains(active) && active !== panelRef.current
      // Si el usuario ya hizo clic en un input del body, no mover el foco.
      if (!focusAlreadyInside) {
        ;(closeBtn || panelRef.current)?.focus()
      }
    })

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4">
      <button
        type="button"
        aria-label="Cerrar fondo"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-app)] outline-none',
          isCoordinador
            ? COORD_MODAL
            : 'border-border bg-surface',
          compact && 'max-h-[calc(100vh-32px)]',
          maxWidthClassName,
          className,
        )}
      >
        {title ? (
          <div
            className={cn(
              'sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5',
              isCoordinador ? COORD_MODAL_HEADER : 'border-border',
              headerClassName,
            )}
          >
            <div className="min-w-0 flex-1">
              <div
                id="modal-title"
                className="text-base font-semibold leading-tight"
              >
                {title}
              </div>
              {subtitle ? (
                <div className="mt-1 truncate text-sm text-sky-200/70">
                  {subtitle}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              data-modal-close
              onClick={onClose}
              aria-label="Cerrar"
              className={cn(
                'shrink-0 rounded-lg px-2.5 py-1 text-xl leading-none hover:bg-white/10',
                isCoordinador
                  ? 'text-sky-200/80'
                  : 'text-muted hover:bg-surface-2 hover:text-app',
              )}
            >
              ×
            </button>
          </div>
        ) : null}

        <div
          ref={bodyRef}
          className={cn(
            compact
              ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain'
              : '',
            'px-4 py-3 sm:px-5',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer ? (
          <div
            className={cn(
              'sticky bottom-0 z-10 shrink-0 border-t px-4 py-3 sm:px-5',
              isCoordinador
                ? COORD_MODAL_FOOTER
                : 'border-border bg-surface-2',
              footerClassName,
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
