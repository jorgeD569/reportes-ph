import { routes } from '@/lib/constants/routes'

export type AppRol = 'operador' | 'supervisor' | 'coordinador' | 'admin'

export type NavItemDef = {
  label: string
  href: string
  roles: readonly AppRol[]
}

/** Rutas de administración de usuarios reservadas para admin (futuro). */
const ADMIN_ONLY_COORDINADOR_PREFIXES = ['/coordinador/usuarios'] as const

/** Rutas del panel de gestión administrativa (inventario, partes operativos en modo edición, etc.). */
const GESTION_PATH_PREFIXES = [
  '/coordinador/inventario/gestion',
  '/coordinador/gestion/',
  '/coordinador/configuracion/',
] as const

export const NAV_OPERADOR: NavItemDef[] = [
  {
    label: 'Parte PH',
    href: routes.operador.partePh,
    roles: ['operador', 'supervisor', 'coordinador', 'admin'],
  },
  {
    label: 'Partes Operativos',
    href: routes.operador.partesOperativos,
    roles: ['operador', 'supervisor', 'coordinador', 'admin'],
  },
  {
    label: 'Capacitaciones HSE',
    href: routes.operador.capacitaciones,
    roles: ['coordinador', 'admin'],
  },
]

export const NAV_DASHBOARD: NavItemDef[] = [
  {
    label: 'Dashboard',
    href: routes.coordinador.dashboard,
    roles: ['supervisor', 'coordinador', 'admin'],
  },
]

export const NAV_COORDINADOR: NavItemDef[] = [
  {
    label: 'Reportes PH',
    href: routes.coordinador.reportesPh,
    roles: ['operador', 'supervisor', 'coordinador', 'admin'],
  },
  {
    label: 'Partes Operativos',
    href: routes.coordinador.partesOperativos,
    roles: ['supervisor', 'coordinador', 'admin'],
  },
  {
    label: 'Capacitaciones HSE',
    href: routes.coordinador.capacitaciones,
    roles: ['coordinador', 'admin'],
  },
  {
    label: 'Activos',
    href: routes.coordinador.inventario.activos,
    roles: ['coordinador', 'admin'],
  },
  {
    label: 'Consumibles',
    href: routes.coordinador.inventario.consumibles,
    roles: ['coordinador', 'admin'],
  },
  {
    label: 'Gestión',
    href: routes.coordinador.inventario.gestion,
    roles: ['coordinador', 'admin'],
  },
  {
    label: 'Usuarios',
    href: routes.coordinador.usuarios,
    roles: ['admin'],
  },
]

export function normalizeRol(rol: string | undefined | null): AppRol | null {
  const normalized = rol?.trim().toLowerCase()
  if (
    normalized === 'operador' ||
    normalized === 'supervisor' ||
    normalized === 'coordinador' ||
    normalized === 'admin'
  ) {
    return normalized
  }
  return null
}

function matchesPathPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

function isAdminOnlyCoordinadorPath(path: string): boolean {
  return ADMIN_ONLY_COORDINADOR_PREFIXES.some((prefix) =>
    matchesPathPrefix(path, prefix)
  )
}

export function isGestionPath(path: string): boolean {
  return GESTION_PATH_PREFIXES.some((prefix) => matchesPathPrefix(path, prefix))
}

export function canAccessGestion(rol: string): boolean {
  const role = normalizeRol(rol)
  return role === 'admin' || role === 'coordinador'
}

function canAccessOperadorPaths(role: AppRol): boolean {
  return (
    role === 'operador' ||
    role === 'supervisor' ||
    role === 'coordinador' ||
    role === 'admin'
  )
}

export function safeRedirectPathForRol(rol: string): string {
  const role = normalizeRol(rol)

  if (role === 'operador') {
    return routes.operador.partesOperativos
  }

  return routes.coordinador.dashboard
}

export function canAccessPath(rol: string, pathname: string): boolean {
  const role = normalizeRol(rol)
  if (!role) return false

  const path = pathname.split('?')[0] || '/'

  if (isGestionPath(path) && !canAccessGestion(rol)) {
    return false
  }

  if (role === 'admin') return true

  if (path.startsWith('/operador')) {
    return canAccessOperadorPaths(role)
  }

  if (role === 'operador') {
    return matchesPathPrefix(path, routes.coordinador.reportesPh)
  }

  if (role === 'supervisor') {
    return (
      matchesPathPrefix(path, routes.coordinador.dashboard) ||
      matchesPathPrefix(path, routes.coordinador.reportesPh) ||
      matchesPathPrefix(path, routes.coordinador.partesOperativos)
    )
  }

  if (role === 'coordinador') {
    if (!path.startsWith('/coordinador')) return false
    return !isAdminOnlyCoordinadorPath(path)
  }

  return false
}

export function filterNavItemsByRol(
  items: readonly NavItemDef[],
  rol: string | null | undefined
): NavItemDef[] {
  const role = normalizeRol(rol ?? '')
  if (!role) return []
  return items.filter((item) => item.roles.includes(role))
}
