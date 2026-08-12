'use client'

import * as React from 'react'
import { Modal } from '@/components/ui/Modal'
import { InlineMessage } from '@/components/ui/InlineMessage'
import {
  COORD_BTN_PRIMARY,
  COORD_BTN_SECONDARY,
} from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'

/**
 * Modal de confirmación del sistema (reemplaza diálogos nativos del navegador).
 * - No cierra mientras `busy`.
 * - Si onConfirm lanza, muestra el error y deja el modal abierto.
 */
export function ConfirmDialog({
  open,
  title = 'Confirmar',
  description,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  destructive = false,
  error: externalError = null,
}: {
  open: boolean
  title?: string
  description?: string
  children?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  destructive?: boolean
  /** Error controlado por el padre (opcional; también se capturan throws de onConfirm). */
  error?: string | null
}) {
  const [busy, setBusy] = React.useState(false)
  const [localError, setLocalError] = React.useState<string | null>(null)
  const busyRef = React.useRef(false)

  const displayError = externalError || localError

  function requestClose() {
    if (busyRef.current) return
    setLocalError(null)
    onCancel()
  }

  async function handleConfirm() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setLocalError(null)
    try {
      await onConfirm()
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={title}
      compact
      maxWidthClassName="w-[min(480px,calc(100vw-32px))] max-w-none"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={COORD_BTN_SECONDARY}
            onClick={requestClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn(
              COORD_BTN_PRIMARY,
              destructive &&
                '!bg-rose-600 hover:!bg-rose-700 hover:!opacity-100',
            )}
            onClick={() => void handleConfirm()}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {description ? (
          <p className="text-sm text-slate-300">{description}</p>
        ) : null}
        {children}
        {displayError ? (
          <InlineMessage
            kind="error"
            title="No se pudo completar"
            description={displayError}
          />
        ) : null}
      </div>
    </Modal>
  )
}
