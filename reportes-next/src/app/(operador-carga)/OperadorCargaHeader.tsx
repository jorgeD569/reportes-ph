'use client'

import { LogoutButton } from '@/components/auth/LogoutButton'

export function OperadorCargaHeader() {
  return (
    <header className="border-b border-border bg-surface shadow-[var(--shadow-app)]">
      <div className="mx-auto flex max-w-5xl min-w-0 items-center justify-between gap-3 px-4 py-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0f1f2d] text-sm font-extrabold text-white">
            K
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Kompass - Operador
            </div>
            <div className="text-base font-semibold text-app md:text-lg">
              Carga de parte operativo
            </div>
          </div>
        </div>
        <LogoutButton />
      </div>
    </header>
  )
}
