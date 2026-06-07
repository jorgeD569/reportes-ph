'use client'

import { logoutAppUsuario } from '@/lib/auth'
import { cn } from '@/lib/cn'

export function LogoutButton({
  className,
  variant = 'topbar',
}: {
  className?: string
  variant?: 'topbar' | 'sidebar'
}) {
  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        className={cn(
          'w-full rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white',
          className
        )}
        onClick={() => logoutAppUsuario()}
      >
        Cerrar sesión
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2',
        className
      )}
      onClick={() => logoutAppUsuario()}
    >
      Cerrar sesión
    </button>
  )
}
