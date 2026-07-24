/**
 * Nombre de pantalla para el botón “Volver a …”.
 * Preferir labels de navegación / PageHeader según el path actual.
 */
export function getBusquedaGlobalOriginLabel(pathname: string): string {
  const path = (pathname || '').split('?')[0] || '/'

  if (path === '/coordinador/dashboard' || path.startsWith('/coordinador/dashboard/')) {
    return 'Dashboard'
  }
  if (
    path === '/coordinador/partes-operativos' ||
    path.startsWith('/coordinador/partes-operativos/')
  ) {
    return 'Partes Operativos'
  }
  if (
    path === '/operador/partes-operativos' ||
    path.startsWith('/operador/partes-operativos/')
  ) {
    return 'Partes Operativos'
  }
  if (path === '/coordinador/reportes-ph' || path.startsWith('/coordinador/reportes-ph/')) {
    return 'Reportes PH'
  }
  if (
    path === '/coordinador/inventario/activos' ||
    path.startsWith('/coordinador/inventario/activos/')
  ) {
    return 'Consultar activos'
  }
  if (
    path === '/coordinador/inventario/manifolds' ||
    path.startsWith('/coordinador/inventario/manifolds/')
  ) {
    return 'Conjuntos de activos'
  }
  if (
    path === '/coordinador/inventario/relevamientos-pendientes' ||
    path.startsWith('/coordinador/inventario/relevamientos-pendientes/')
  ) {
    return 'Relevamientos pendientes'
  }
  if (
    path === '/coordinador/inventario/consumibles' ||
    path.startsWith('/coordinador/inventario/consumibles/')
  ) {
    return 'Consumibles'
  }
  if (
    path === '/coordinador/inventario/gestion/inventario' ||
    path.startsWith('/coordinador/inventario/gestion/inventario/')
  ) {
    return 'Gestión de inventario'
  }
  if (
    path === '/coordinador/gestion' ||
    path === '/coordinador/inventario/gestion'
  ) {
    return 'Gestión del sistema'
  }
  if (
    path === '/coordinador/gestion/partes-operativos' ||
    path.startsWith('/coordinador/gestion/partes-operativos/')
  ) {
    return 'Gestión de partes operativos'
  }
  if (
    path === '/coordinador/configuracion/contratos' ||
    path.startsWith('/coordinador/configuracion/contratos/')
  ) {
    return 'Gestión de contratos'
  }
  if (path === '/coordinador/usuarios' || path.startsWith('/coordinador/usuarios/')) {
    return 'Usuarios'
  }
  if (
    path === '/coordinador/capacitaciones' ||
    path.startsWith('/coordinador/capacitaciones/')
  ) {
    return 'Capacitaciones HSE'
  }
  if (path === '/operador/capacitaciones' || path.startsWith('/operador/capacitaciones/')) {
    return 'Mis capacitaciones HSE'
  }
  if (path === '/operador/parte-ph' || path.startsWith('/operador/parte-ph/')) {
    return 'Parte PH'
  }

  return 'la pantalla anterior'
}

export function getVolverBusquedaGlobalLabel(pathname: string): string {
  const label = getBusquedaGlobalOriginLabel(pathname)
  if (label === 'Dashboard') return 'Volver al Dashboard'
  if (label === 'la pantalla anterior') return 'Volver'
  return `Volver a ${label}`
}
