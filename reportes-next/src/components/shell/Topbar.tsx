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
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-app">
              {title || 'REPORTES PH'}
            </div>
            <div className="truncate text-xs text-muted">Panel operativo</div>
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

