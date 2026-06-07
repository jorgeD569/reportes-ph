'use client'

import { GestionInventarioGate } from '@/components/coordinador/inventario/GestionInventarioGate'
import { GestionModuleCard } from '@/components/coordinador/inventario/GestionModuleCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { COORD_BTN_SECONDARY } from '@/lib/coordinador/theme'
import { routes } from '@/lib/constants/routes'

const MODULES = [
  {
    title: 'Gestión de inventario',
    description: 'Alta de activos, consumibles, movimientos y trazabilidad.',
    actionLabel: 'Ingresar a inventario',
    href: routes.coordinador.inventario.gestionInventario,
  },
  {
    title: 'Gestión de partes operativos',
    description:
      'Administración, edición, reapertura y regeneración de partes operativos.',
    actionLabel: 'Ingresar a partes operativos',
    href: routes.coordinador.gestion.partesOperativos,
  },
  {
    title: 'Gestión de capacitaciones HSE',
    description: 'Alta, edición y asignación de capacitaciones.',
    actionLabel: 'Ingresar a capacitaciones',
    href: routes.coordinador.capacitaciones,
  },
  {
    title: 'Configuración del sistema',
    description: 'Parámetros generales, usuarios, permisos y opciones futuras.',
    actionLabel: 'Próximamente',
    disabled: true,
  },
] as const

export function GestionDashboardClient() {
  return (
    <GestionInventarioGate>
      {({ logout }) => (
        <div className="space-y-6">
          <PageHeader
            title="Gestión del sistema"
            subtitle="Panel administrativo. Elegí el módulo que querés administrar."
            right={
              <>
                <StatusBadge variant="warning">Acceso restringido</StatusBadge>
                <button
                  type="button"
                  onClick={logout}
                  className={COORD_BTN_SECONDARY}
                >
                  Cerrar sesión
                </button>
              </>
            }
          />

          <div className="grid gap-5 sm:grid-cols-2">
            {MODULES.map((mod) => (
              <GestionModuleCard
                key={mod.title}
                title={mod.title}
                description={mod.description}
                actionLabel={mod.actionLabel}
                href={'href' in mod ? mod.href : undefined}
                disabled={'disabled' in mod ? mod.disabled : false}
              />
            ))}
          </div>
        </div>
      )}
    </GestionInventarioGate>
  )
}
