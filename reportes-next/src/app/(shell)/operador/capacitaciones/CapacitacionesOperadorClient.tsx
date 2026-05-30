'use client'

import * as React from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { btnPrimaryClass } from '@/components/capacitaciones/capacitaciones-form-styles'
import { fetchAsignacionesOperador, fetchCapacitacion } from '@/lib/capacitaciones/api'
import { MOCK_OPERADOR_ID } from '@/lib/capacitaciones/constants'
import {
  asignacionEstadoLabel,
  asignacionEstadoVariant,
} from '@/lib/capacitaciones/status'
import { routes } from '@/lib/constants/routes'
import { formatFechaSoloDia } from '@/lib/date'
import type { Capacitacion, CapacitacionAsignacion } from '@/lib/types/capacitaciones'

type Row = CapacitacionAsignacion & { capacitacion?: Capacitacion | null }

const btnSecondary =
  'inline-flex h-9 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-app hover:bg-surface-2'

export function CapacitacionesOperadorClient() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<Row[]>([])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const asignaciones = await fetchAsignacionesOperador(MOCK_OPERADOR_ID)
        const enriched = await Promise.all(
          asignaciones.map(async (a) => ({
            ...a,
            capacitacion: await fetchCapacitacion(a.capacitacion_id),
          }))
        )
        if (!cancelled) setRows(enriched)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error cargando asignaciones')
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
        title="Mis capacitaciones HSE"
        subtitle="Completá las capacitaciones asignadas y registrá tu firma como evidencia."
      />

      {loading ? <LoadingState label="Cargando capacitaciones…" /> : null}
      {error ? <InlineMessage kind="error" title="Error" description={error} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="Sin capacitaciones asignadas"
          description="Cuando el coordinador te asigne una capacitación, aparecerá acá."
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 font-semibold text-app">
                      {row.capacitacion?.titulo ?? 'Capacitación'}
                    </div>
                    <StatusBadge variant={asignacionEstadoVariant(row.estado)}>
                      {asignacionEstadoLabel(row.estado)}
                    </StatusBadge>
                  </div>
                </CardHeader>
                <CardBody className="space-y-3 pt-0">
                  <p className="line-clamp-2 text-sm text-muted">
                    {row.capacitacion?.descripcion || '—'}
                  </p>
                  <div className="text-xs text-muted">
                    Vence: {formatFechaSoloDia(row.fecha_vencimiento)}
                  </div>
                  {row.estado === 'realizada' ? (
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      Completada
                    </span>
                  ) : (
                    <Link
                      href={routes.operador.capacitacionDetalle(row.capacitacion_id)}
                      className={row.estado === 'vencida' ? btnSecondary : btnPrimaryClass}
                    >
                      {row.estado === 'vencida' ? 'Ver capacitación' : 'Ingresar'}
                    </Link>
                  )}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
