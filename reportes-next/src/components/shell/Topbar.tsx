'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/cn'

export function Topbar({
  title,
  onToggleSidebar,
  right,
}: {
  title?: string
  onToggleSidebar?: () => void
  right?: React.ReactNode
}) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const current = theme === 'system' ? resolvedTheme : theme

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-app/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          {onToggleSidebar ? (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-2 md:hidden"
              aria-label="Abrir menú"
            >
              <span className="text-lg leading-none">≡</span>
            </button>
          ) : null}
          <div
            className={cn(
              'flex min-w-0 flex-col items-center justify-center rounded-2xl px-5 py-2.5 text-center',
              'bg-[linear-gradient(135deg,#0c2c40_0%,#0f1f2d_55%,#13283a_100%)]',
              'shadow-[0_4px_16px_rgba(15,31,45,0.22)]'
            )}
          >
            <div className="truncate text-sm font-extrabold uppercase tracking-[0.14em] text-white md:text-base">
              {title || 'Cpanel'}
            </div>
            <div className="mt-0.5 truncate text-xs font-medium text-white/65">
              Panel operativo
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {right}
          <button
            type="button"
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2'
            )}
            onClick={() => setTheme(current === 'dark' ? 'light' : 'dark')}
          >
            <span className="text-xs text-muted">Tema</span>
            <span>{current === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

