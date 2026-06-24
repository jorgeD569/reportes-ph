'use client'

import * as React from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { ModernTable, Td, Th } from '@/components/ui/ModernTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fetchCapacitaciones } from '@/lib/capacitaciones/api'
import {
  COORD_BTN_PRIMARY_LG,
  COORD_BTN_SECONDARY,
} from '@/lib/coordinador/theme'
import { routes } from '@/lib/constants/routes'
import { formatDateTimeEsAr } from '@/lib/date'
import type { Capacitacion } from '@/lib/types/capacitaciones'

export function CapacitacionesCoordinadorClient() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<Capacitacion[]>([])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchCapacitaciones()
        if (!cancelled) setItems(data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error cargando capacitaciones')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Capacitaciones HSE"
        subtitle="Creá capacitaciones, asignalas a operadores y registrá evidencia de firma."
        right={
          <Link href={routes.coordinador.capacitacionesNueva} className={COORD_BTN_PRIMARY_LG}>
            Nueva capacitación
          </Link>
        }
      />

      {loading ? <LoadingState label="Cargando capacitaciones…" /> : null}
      {error ? (
        <InlineMessage kind="error" title="Error" description={error} />
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="Sin capacitaciones"
          description="Creá la primera capacitación HSE para tu equipo."
          action={
            <Link href={routes.coordinador.capacitacionesNueva} className={COORD_BTN_PRIMARY_LG}>
              Nueva capacitación
            </Link>
          }
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold text-app">Listado</div>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="hidden overflow-x-auto lg:block">
              <ModernTable className="border-0">
                <thead>
                  <tr>
                    <Th>Título</Th>
                    <Th>Versión</Th>
                    <Th>Estado</Th>
                    <Th>Creación</Th>
                    <Th className="text-right">Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((cap) => (
                    <tr key={cap.id} className="border-t border-border">
                      <Td className="font-medium">{cap.titulo}</Td>
                      <Td>{cap.version}</Td>
                      <Td>
                        <StatusBadge variant={cap.activa ? 'success' : 'neutral'}>
                          {cap.activa ? 'Activa' : 'Inactiva'}
                        </StatusBadge>
                      </Td>
                      <Td>{formatDateTimeEsAr(cap.created_at)}</Td>
                      <Td className="text-right">
                        <Link
                          href={routes.coordinador.capacitacionDetalle(cap.id)}
                          className={COORD_BTN_SECONDARY}
                        >
                          Ver detalle
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </ModernTable>
            </div>

            <ul className="space-y-3 lg:hidden">
              {items.map((cap) => (
                <li
                  key={cap.id}
                  className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-app)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-app">{cap.titulo}</div>
                      <div className="mt-1 text-sm text-muted">Versión {cap.version}</div>
                    </div>
                    <StatusBadge variant={cap.activa ? 'success' : 'neutral'}>
                      {cap.activa ? 'Activa' : 'Inactiva'}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    {formatDateTimeEsAr(cap.created_at)}
                  </div>
                  <div className="mt-4">
                    <Link
                      href={routes.coordinador.capacitacionDetalle(cap.id)}
                      className={COORD_BTN_SECONDARY}
                    >
                      Ver detalle
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
