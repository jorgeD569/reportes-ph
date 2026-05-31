'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { cn } from '@/lib/cn'

function AppShellFallback({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-app text-app">
      <div className="mx-auto grid w-full min-w-0 max-w-[1400px] grid-cols-1 md:grid-cols-[280px_1fr]">
        <div className="hidden md:block">
          <div className="sticky top-0 h-screen">
            <Sidebar />
          </div>
        </div>
        <div className="min-w-0">
          <Topbar title={title} />
          <main className="min-w-0 overflow-x-hidden px-4 py-6 md:px-6">
            <div className="mx-auto w-full min-w-0 max-w-full">{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}

function AppShellInner({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isParteOperativoFlow =
    pathname.startsWith('/operador/partes-operativos') ||
    (pathname.startsWith('/operador/parte-ph') &&
      Boolean(searchParams.get('parte_operativo_id')?.trim()))

  const [mobileOpen, setMobileOpen] = React.useState(false)
  const showChromeOnMobile = !isParteOperativoFlow

  return (
    <div className="min-h-screen overflow-x-hidden bg-app text-app">
      <div
        className={cn(
          'mx-auto grid w-full min-w-0 max-w-[1400px] grid-cols-1',
          isParteOperativoFlow ? 'lg:grid-cols-[280px_1fr]' : 'md:grid-cols-[280px_1fr]'
        )}
      >
        <div className={cn('hidden', isParteOperativoFlow ? 'lg:block' : 'md:block')}>
          <div className="sticky top-0 h-screen">
            <Sidebar />
          </div>
        </div>

        <div className="min-w-0">
          <div className={cn(isParteOperativoFlow && 'hidden lg:block')}>
            <Topbar title={title} onToggleSidebar={() => setMobileOpen(true)} />
          </div>

          <main className="min-w-0 overflow-x-hidden px-4 py-6 md:px-6">
            <div
              className={cn(
                'mx-auto w-full min-w-0 max-w-full',
                isParteOperativoFlow && 'max-lg:max-w-2xl'
              )}
            >
              {children}
            </div>
          </main>
        </div>
      </div>

      {showChromeOnMobile && mobileOpen ? (
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

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  return (
    <Suspense fallback={<AppShellFallback title={title}>{children}</AppShellFallback>}>
      <AppShellInner title={title}>{children}</AppShellInner>
    </Suspense>
  )
}
