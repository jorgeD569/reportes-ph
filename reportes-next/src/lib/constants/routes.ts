export const routes = {
  operador: {
    /** Alias explícito: formulario operador PH */
    partePh: '/operador/parte-ph',
    operadorPartePh: '/operador/parte-ph',
    partesOperativos: '/operador/partes-operativos',
    parteOperativo: (id: string) =>
      `/operador/partes-operativos/${encodeURIComponent(id)}`,
    parteOperativoServicios: (id: string) =>
      `/operador/partes-operativos/${encodeURIComponent(id)}/servicios`,
  },
  coordinador: {
    dashboard: '/coordinador/dashboard',
    reportesPh: '/coordinador/reportes-ph',
    partesOperativos: '/coordinador/partes-operativos',
    reportePhDetalle: (id: string) => `/coordinador/reportes-ph/${encodeURIComponent(id)}`,
    inventario: {
      activos: '/coordinador/inventario/activos',
      consumibles: '/coordinador/inventario/consumibles',
      gestion: '/coordinador/inventario/gestion',
    },
  },
} as const

