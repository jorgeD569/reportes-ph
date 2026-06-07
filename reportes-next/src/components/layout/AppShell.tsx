'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { cn } from '@/lib/cn'

const SIDEBAR_WIDTH_CLASS = 'w-[280px]'

function sidebarVisibilityClass(isParteOperativoFlow: boolean) {
  return isParteOperativoFlow ? 'hidden lg:block' : 'hidden md:block'
}

function mainOffsetClass(isParteOperativoFlow: boolean) {
  return isParteOperativoFlow ? 'lg:ml-[280px]' : 'md:ml-[280px]'
}

function AppShellFallback({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-app text-app">
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30',
          SIDEBAR_WIDTH_CLASS,
          sidebarVisibilityClass(false)
        )}
      >
        <Sidebar />
      </div>

      <div className={cn('flex min-h-screen min-w-0 flex-col', mainOffsetClass(false))}>
        <Topbar title={title} />
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 md:px-6">
          <div className="w-full min-w-0">{children}</div>
        </main>
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
          'fixed inset-y-0 left-0 z-30',
          SIDEBAR_WIDTH_CLASS,
          sidebarVisibilityClass(isParteOperativoFlow)
        )}
      >
        <Sidebar />
      </div>

      <div
        className={cn(
          'flex min-h-screen min-w-0 flex-col',
          mainOffsetClass(isParteOperativoFlow),
          isParteOperativoFlow && 'max-lg:max-w-2xl max-lg:mx-auto'
        )}
      >
        <div className={cn(isParteOperativoFlow && 'hidden lg:block')}>
          <Topbar title={title} onToggleSidebar={() => setMobileOpen(true)} />
        </div>

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 md:px-6">
          <div className="w-full min-w-0">{children}</div>
        </main>
      </div>

      {showChromeOnMobile && mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[min(320px,90vw)] shadow-[var(--shadow-app)]">
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
