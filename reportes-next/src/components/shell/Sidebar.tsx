'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { routes } from '@/lib/constants/routes'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { readAppUsuario } from '@/lib/auth'
import {
  filterNavGroupByRol,
  filterNavItemsByRol,
  NAV_COORDINADOR,
  NAV_DASHBOARD,
  NAV_INVENTARIO,
  NAV_OPERADOR,
  type NavGroupDef,
  type NavItemDef,
} from '@/lib/permissions'
import { cn } from '@/lib/cn'
import { SidebarBrand } from '@/components/shell/SidebarBrand'

/** Rutas de menú sin hijos en la URL: solo coincidencia exacta. */
const EXACT_MATCH_HREFS = new Set<string>([
  routes.operador.partePh,
  routes.operador.partesOperativos,
  routes.operador.capacitaciones,
  routes.coordinador.dashboard,
  routes.coordinador.reportesPh,
  routes.coordinador.partesOperativos,
  routes.coordinador.capacitaciones,
  routes.coordinador.inventario.activos,
  routes.coordinador.inventario.relevamientosPendientes,
  routes.coordinador.inventario.manifolds,
  routes.coordinador.inventario.consumibles,
  routes.coordinador.gestion.sistema,
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
  nested,
}: {
  item: NavItemDef
  onNavigate?: () => void
  nested?: boolean
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
        nested && 'pl-4 text-[13px]',
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

function InventarioNavGroup({
  group,
  onNavigate,
}: {
  group: NavGroupDef
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const childActive = group.items.some((it) => isNavActive(pathname, it.href))
  const [manualOpen, setManualOpen] = React.useState(false)
  const open = childActive || manualOpen

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition',
          childActive
            ? 'bg-white/10 text-white'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        )}
        aria-expanded={open}
        onClick={() => setManualOpen((v) => !v)}
      >
        <span>{group.label}</span>
        <span className="text-xs opacity-70" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div className="mt-1 flex flex-col gap-1 border-l border-white/10 ml-2 pl-1">
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              onNavigate={onNavigate}
              nested
            />
          ))}
        </div>
      ) : null}
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
  const navInventario = filterNavGroupByRol(NAV_INVENTARIO, rol)

  const navCoordinadorMain = navCoordinador.filter(
    (i) =>
      i.href !== routes.coordinador.usuarios &&
      i.href !== routes.coordinador.gestion.sistema,
  )
  const navGestionSistema = navCoordinador.filter(
    (i) => i.href === routes.coordinador.gestion.sistema,
  )
  const navUsuarios = navCoordinador.filter(
    (i) => i.href === routes.coordinador.usuarios,
  )

  const showNavGroups =
    navOperador.length > 0 ||
    navCoordinador.length > 0 ||
    Boolean(navInventario)

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

        {(navCoordinador.length > 0 || navInventario) && (
          <div>
            <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
              Coordinador
            </div>
            <div className="flex flex-col gap-1">
              {navCoordinadorMain.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
              {navInventario ? (
                <InventarioNavGroup group={navInventario} onNavigate={onNavigate} />
              ) : null}
              {navGestionSistema.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
              {navUsuarios.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="space-y-3 px-1 pt-4">
        <LogoutButton variant="sidebar" />
        <div className="px-1 text-xs text-white/50">© 2026 Kompass</div>
      </div>
    </aside>
  )
}

