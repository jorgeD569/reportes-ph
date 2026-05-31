'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { routes } from '@/lib/constants/routes'
import { cn } from '@/lib/cn'
import { SidebarBrand } from '@/components/shell/SidebarBrand'

type NavItem = {
  label: string
  href: string
}

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
  item: NavItem
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

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const navOperador: NavItem[] = [
    { label: 'Parte PH', href: routes.operador.partePh },
    { label: 'Partes Operativos', href: routes.operador.partesOperativos },
    { label: 'Capacitaciones HSE', href: routes.operador.capacitaciones },
  ]

  const navCoordinador: NavItem[] = [
    { label: 'Dashboard', href: routes.coordinador.dashboard },
    { label: 'Reportes PH', href: routes.coordinador.reportesPh },
    { label: 'Partes Operativos', href: routes.coordinador.partesOperativos },
    { label: 'Capacitaciones HSE', href: routes.coordinador.capacitaciones },
    { label: 'Activos', href: routes.coordinador.inventario.activos },
    { label: 'Consumibles', href: routes.coordinador.inventario.consumibles },
    { label: 'Gestión', href: routes.coordinador.inventario.gestion },
  ]

  return (
    <aside className="flex h-full w-full flex-col border-r border-white/10 bg-[linear-gradient(180deg,#0f1f2d_0%,#13283a_100%)] px-3 py-4 text-white">
      <div className="px-1 pb-5">
        <SidebarBrand />
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-1">
        <div>
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            Operador
          </div>
          <div className="flex flex-col gap-1">
            {navOperador.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>

        <div>
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            Coordinador
          </div>
          <div className="flex flex-col gap-1">
            {navCoordinador.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </nav>

      <div className="px-2 pt-4 text-xs text-white/50">© 2026 Kompass</div>
    </aside>
  )
}
