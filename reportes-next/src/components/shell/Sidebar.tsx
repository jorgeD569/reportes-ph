'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { routes } from '@/lib/constants/routes'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { readAppUsuario } from '@/lib/auth'
import {
  filterNavItemsByRol,
  NAV_COORDINADOR,
  NAV_DASHBOARD,
  NAV_OPERADOR,
  type NavItemDef,
} from '@/lib/permissions'
import { cn } from '@/lib/cn'
import { SidebarBrand } from '@/components/shell/SidebarBrand'

/** Rutas de menú sin hijos en la URL: solo coincidencia exacta (evita conflictos entre /operador/parte-ph y /operador/partes-operativos). */
const EXACT_MATCH_HREFS = new Set<string>([
  routes.operador.partePh,
  routes.operador.partesOperativos,
  routes.operador.capacitaciones,
  routes.coordinador.dashboard,
  routes.coordinador.reportesPh,
  routes.coordinador.partesOperativos,
  routes.coordinador.capacitaciones,
  routes.coordinador.inventario.activos,
  routes.coordinador.inventario.consumibles,
  routes.coordinador.inventario.gestion,
  routes.coordinador.usuarios,
])

function isNavActive(pathname: string, href: string) {
  if (pathname === href) return true
  if (EXACT_MATCH_HREFS.has(href)) return false
  return pathname.startsWith(`${href}/`)
}

function NavLink({
  item,
  onNavigate,
}: {
  item: NavItemDef
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const active = isNavActive(pathname, item.href)

  return (
    <Link
      href={item.href}
      prefetch={item.href === routes.operador.partePh}
      onClick={() => onNavigate?.()}
      className={cn(
        'flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition',
        active
          ? 'bg-white/10 text-white'
          : 'text-white/80 hover:bg-white/10 hover:text-white'
      )}
    >
      <span>{item.label}</span>
    </Link>
  )
}

function NavSection({
  title,
  items,
  onNavigate,
}: {
  title: string
  items: NavItemDef[]
  onNavigate?: () => void
}) {
  if (items.length === 0) return null

  return (
    <div>
      <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
        {title}
      </div>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  )
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [rol, setRol] = React.useState<string | null>(null)

  React.useEffect(() => {
    const usuario = readAppUsuario()
    React.startTransition(() => {
      setRol(usuario?.rol ?? null)
    })
  }, [])

  const navDashboard = filterNavItemsByRol(NAV_DASHBOARD, rol)
  const navOperador = filterNavItemsByRol(NAV_OPERADOR, rol)
  const navCoordinador = filterNavItemsByRol(NAV_COORDINADOR, rol)

  const showNavGroups = navOperador.length > 0 || navCoordinador.length > 0

  return (
    <aside className="flex h-screen w-full flex-col overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,#0f1f2d_0%,#13283a_100%)] px-3 py-4 text-white">
      <div className="px-1 pb-5">
        <SidebarBrand />
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-1">
        {navDashboard.length > 0 ? (
          <div className="flex flex-col gap-1">
            {navDashboard.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        ) : null}

        {navDashboard.length > 0 && showNavGroups ? (
          <div className="border-t border-white/10" aria-hidden />
        ) : null}

        <NavSection title="Operador" items={navOperador} onNavigate={onNavigate} />
        <NavSection
          title="Coordinador"
          items={navCoordinador}
          onNavigate={onNavigate}
        />
      </nav>

      <div className="space-y-3 px-1 pt-4">
        <LogoutButton variant="sidebar" />
        <div className="px-1 text-xs text-white/50">© 2026 Kompass</div>
      </div>
    </aside>
  )
}
