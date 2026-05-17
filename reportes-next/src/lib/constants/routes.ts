export const routes = {
  operador: {
    partePh: '/operador/parte-ph',
    partesOperativos: '/operador/partes-operativos',
  },
  coordinador: {
    dashboard: '/coordinador/dashboard',
    reportesPh: '/coordinador/reportes-ph',
    reportePhDetalle: (id: string) => `/coordinador/reportes-ph/${encodeURIComponent(id)}`,
    inventario: {
      activos: '/coordinador/inventario/activos',
      consumibles: '/coordinador/inventario/consumibles',
      gestion: '/coordinador/inventario/gestion',
    },
  },
} as const

