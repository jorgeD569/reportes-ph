export const routes = {
  operador: {
    /** Alias explícito: formulario operador PH */
    partePh: '/operador/parte-ph',
    operadorPartePh: '/operador/parte-ph',
    partesOperativos: '/operador/partes-operativos',
    capacitaciones: '/operador/capacitaciones',
    capacitacionDetalle: (id: string) =>
      `/operador/capacitaciones/${encodeURIComponent(id)}`,
    parteOperativo: (id: string) =>
      `/operador/partes-operativos/${encodeURIComponent(id)}`,
    parteOperativoServicios: (id: string) =>
      `/operador/partes-operativos/${encodeURIComponent(id)}/servicios`,
  },
  coordinador: {
    dashboard: '/coordinador/dashboard',
    reportesPh: '/coordinador/reportes-ph',
    partesOperativos: '/coordinador/partes-operativos',
    capacitaciones: '/coordinador/capacitaciones',
    capacitacionesNueva: '/coordinador/capacitaciones/nueva',
    capacitacionDetalle: (id: string) =>
      `/coordinador/capacitaciones/${encodeURIComponent(id)}`,
    reportePhDetalle: (id: string) => `/coordinador/reportes-ph/${encodeURIComponent(id)}`,
    gestion: {
      /** Panel hub “Gestión del sistema”. */
      sistema: '/coordinador/gestion',
      partesOperativos: '/coordinador/gestion/partes-operativos',
      parteOperativo: (id: string) =>
        `/coordinador/gestion/partes-operativos/${encodeURIComponent(id)}`,
    },
    configuracion: {
      contratos: '/coordinador/configuracion/contratos',
    },
    inventario: {
      activos: '/coordinador/inventario/activos',
      relevamientosPendientes: '/coordinador/inventario/relevamientos-pendientes',
      manifolds: '/coordinador/inventario/manifolds',
      consumibles: '/coordinador/inventario/consumibles',
      /** @deprecated Hub movido a routes.coordinador.gestion.sistema; se conserva para redirect. */
      gestion: '/coordinador/inventario/gestion',
      gestionInventario: '/coordinador/inventario/gestion/inventario',
      categorias: '/coordinador/inventario/gestion/categorias',
    },
    usuarios: '/coordinador/usuarios',
  },
} as const

