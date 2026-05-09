'use client'

import * as React from 'react'
import { Modal } from '@/components/ui/Modal'

export function ConfirmDialog({
  open,
  title = 'Confirmar',
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  destructive = false,
}: {
  open: boolean
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  destructive?: boolean
}) {
  const [busy, setBusy] = React.useState(false)

  async function handleConfirm() {
    try {
      setBusy(true)
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-app hover:bg-surface-2 disabled:opacity-60"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={[
              'rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60',
              destructive
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] hover:opacity-95',
            ].join(' ')}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      }
    >
      {description ? <p className="text-sm text-muted">{description}</p> : null}
    </Modal>
  )
}

