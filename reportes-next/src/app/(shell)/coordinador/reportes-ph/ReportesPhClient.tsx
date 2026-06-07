'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { ModernTable, Td, Th, Tr } from '@/components/ui/ModernTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { routes } from '@/lib/constants/routes'
import {
  COORD_BTN_LINK,
  COORD_BTN_PRIMARY,
  COORD_INPUT_LG,
  COORD_SECTION_MUTED,
  COORD_SECTION_TITLE,
} from '@/lib/coordinador/theme'
import { get } from '@/lib/api'
import type { GetReportesPhResponse, ReportePhListItem } from '@/lib/types/reportes'
import { formatDateDDMMYYYY } from '@/lib/date'
import { reportePhState, reportePhStateLabel } from '@/lib/status'

export function ReportesPhClient() {
  const params = useSearchParams()
  const estado = params.get('estado') // pendiente | cerrado | null

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<ReportePhListItem[]>([])
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const data = await get<GetReportesPhResponse>('/reportes-ph')
        if (cancelled) return
        setItems(data.reportes || [])
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = React.useMemo(() => {
    let list = [...items]

    if (estado === 'pendiente') {
      list = list.filter((r) => !r.reporte_pdf_path)
    } else if (estado === 'cerrado') {
      list = list.filter((r) => !!r.reporte_pdf_path)
    }

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => {
        const haystack = [r.reporte_numero, r.pozo, r.cliente]
          .map((x) => String(x || '').toLowerCase())
          .join(' ')
        return haystack.includes(q)
      })
    }

    return list
  }, [items, estado, query])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes de PH"
        subtitle="Listado de reportes cargados."
        right={
          <div className="flex items-center gap-2">
            <Link className={COORD_BTN_LINK} href={`${routes.coordinador.reportesPh}?estado=pendiente`}>
              Pendientes
            </Link>
            <Link className={COORD_BTN_LINK} href={`${routes.coordinador.reportesPh}?estado=cerrado`}>
              Cerrados
            </Link>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <div>
            <div className={COORD_SECTION_TITLE}>Listado</div>
            <div className={COORD_SECTION_MUTED}>
              Datos en vivo desde <code className="font-mono">GET /reportes-ph</code>.
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              className={`${COORD_INPUT_LG} md:max-w-md`}
              placeholder="Buscar por reporte, pozo o cliente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <StatusBadge variant="info">
              {estado === 'pendiente'
                ? 'Filtrado: pendientes'
                : estado === 'cerrado'
                ? 'Filtrado: cerrados'
                : 'Todos'}
            </StatusBadge>
          </div>

          {loading ? <LoadingState label="Cargando reportes…" /> : null}
          {error ? (
            <InlineMessage
              kind="error"
              title="No se pudieron cargar los reportes"
              description={error}
              className="mb-4"
            />
          ) : null}

          <ModernTable>
            <thead>
              <tr>
                <Th>Reporte N°</Th>
                <Th>Fecha</Th>
                <Th>Cliente</Th>
                <Th>Pozo</Th>
                <Th>Elemento</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acción</Th>
              </tr>
            </thead>
            <tbody>
              {!loading && !error && filtered.length === 0 ? (
                <tr>
                  <Td colSpan={7}>
                    <EmptyState
                      title="No hay reportes para mostrar"
                      description="Probá cambiar el filtro o la búsqueda."
                    />
                  </Td>
                </tr>
              ) : null}

              {!loading && !error
                ? filtered.map((r) => {
                    const st = reportePhState(r)
                    return (
                      <Tr key={r.id}>
                        <Td className="font-semibold">{r.reporte_numero || ''}</Td>
                        <Td>{formatDateDDMMYYYY(r.fecha)}</Td>
                        <Td>{r.cliente || ''}</Td>
                        <Td>{r.pozo || ''}</Td>
                        <Td>{r.elemento_ensayar || ''}</Td>
                        <Td>
                          <StatusBadge
                            variant={
                              st === 'pdf_generado'
                                ? 'success'
                                : st === 'con_grafico'
                                ? 'info'
                                : 'warning'
                            }
                          >
                            {r.estado || reportePhStateLabel(st)}
                          </StatusBadge>
                        </Td>
                        <Td className="text-right">
                          <Link
                            href={routes.coordinador.reportePhDetalle(r.id)}
                            className={COORD_BTN_PRIMARY}
                          >
                            Ver
                          </Link>
                        </Td>
                      </Tr>
                    )
                  })
                : null}
            </tbody>
          </ModernTable>
        </CardBody>
      </Card>
    </div>
  )
}

