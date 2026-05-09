'use client'

import * as React from 'react'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { cn } from '@/lib/cn'

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="min-h-screen bg-app text-app">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 md:grid-cols-[280px_1fr]">
        <div className="hidden md:block">
          <div className="sticky top-0 h-screen">
            <Sidebar />
          </div>
        </div>

        <div className="min-w-0">
          <Topbar title={title} onToggleSidebar={() => setMobileOpen(true)} />

          <main className="px-4 py-6 md:px-6">
            <div className="mx-auto w-full">{children}</div>
          </main>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className={cn(
              'absolute left-0 top-0 h-full w-[min(320px,90vw)] shadow-[var(--shadow-app)]'
            )}
          >
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

