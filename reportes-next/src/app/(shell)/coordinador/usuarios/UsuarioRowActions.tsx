'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { UsuarioApp } from '@/lib/types/usuarios'

const MENU_BTN =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-semibold text-sky-100 transition hover:border-sky-400/30 hover:bg-white/10 disabled:opacity-50'

const MENU_ITEM =
  'flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition hover:bg-white/10'

export function UsuarioRowActions({
  user,
  open,
  onToggle,
  onClose,
  protectedUser,
  toggling,
  resetting,
  deleting,
  onEdit,
  onReset,
  onToggleActivo,
  onDelete,
}: {
  user: UsuarioApp
  open: boolean
  onToggle: () => void
  onClose: () => void
  protectedUser: boolean
  toggling: boolean
  resetting: boolean
  deleting: boolean
  onEdit: () => void
  onReset: () => void
  onToggleActivo: () => void
  onDelete: () => void
}) {
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, onClose])

  function runAction(action: () => void) {
    onClose()
    action()
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className={MENU_BTN}
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Acciones
        <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[190px] overflow-hidden rounded-xl border border-white/10 bg-[#0f2433] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          <button
            type="button"
            role="menuitem"
            className={cn(MENU_ITEM, 'text-sky-100')}
            onClick={() => runAction(onEdit)}
          >
            Editar
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={resetting}
            className={cn(MENU_ITEM, 'text-violet-200 disabled:opacity-50')}
            onClick={() => runAction(onReset)}
          >
            {resetting ? 'Restableciendo…' : 'Restablecer contraseña'}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={toggling}
            className={cn(MENU_ITEM, 'text-amber-200 disabled:opacity-50')}
            onClick={() => runAction(onToggleActivo)}
          >
            {toggling ? 'Procesando…' : user.activo ? 'Desactivar' : 'Activar'}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={deleting || protectedUser}
            className={cn(MENU_ITEM, 'text-rose-300 disabled:opacity-50')}
            onClick={() => runAction(onDelete)}
          >
            Eliminar
          </button>
        </div>
      ) : null}
    </div>
  )
}
