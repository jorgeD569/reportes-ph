'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { ModernTable, Td, Th, Tr } from '@/components/ui/ModernTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/Toast'
import { routes } from '@/lib/constants/routes'
import {
  COORD_BTN_DANGER,
  COORD_BTN_LINK,
  COORD_BTN_PRIMARY,
  COORD_INPUT_LG,
  COORD_SECTION_MUTED,
  COORD_SECTION_TITLE,
} from '@/lib/coordinador/theme'
import { del, get } from '@/lib/api'
import type { GetReportesPhResponse, ReportePhListItem } from '@/lib/types/reportes'
import { formatDateDDMMYYYY } from '@/lib/date'
import { reportePhState, reportePhStateLabel } from '@/lib/status'

type DeleteReportePhResponse = {
  ok: boolean
  message?: string
  error?: string
}

export function ReportesPhClient() {
  const params = useSearchParams()
  const estado = params.get('estado') // pendiente | cerrado | null
  const { push: pushToast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<ReportePhListItem[]>([])
  const [query, setQuery] = React.useState('')
  const [deleteConfirm, setDeleteConfirm] = React.useState<{
    open: boolean
    reporte: ReportePhListItem | null
  }>({ open: false, reporte: null })

  const load = React.useCallback(async () => {
    const data = await get<GetReportesPhResponse>('/reportes-ph')
    setItems(data.reportes || [])
  }, [])

  React.useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        setLoading(true)
        setError(null)
        await load()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [load])

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

  function openDeleteConfirm(reporte: ReportePhListItem) {
    setDeleteConfirm({ open: true, reporte })
  }

  function closeDeleteConfirm() {
    setDeleteConfirm({ open: false, reporte: null })
  }

  async function executeDelete() {
    const reporte = deleteConfirm.reporte
    if (!reporte) return

    try {
      await del<DeleteReportePhResponse>(
        `/reportes-ph/${encodeURIComponent(reporte.id)}`
      )
      closeDeleteConfirm()
      await load()
      pushToast({ kind: 'success', title: 'Reporte PH eliminado correctamente' })
    } catch (e) {
      pushToast({
        kind: 'error',
        title: e instanceof Error ? e.message : 'No se pudo eliminar el reporte PH',
      })
      throw e
    }
  }

  const deleteDialogDescription =
    'Se eliminará el reporte PH seleccionado. Esta acción no se puede deshacer.'

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
              Buscá y filtrá por estado o palabra clave.
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
                          <div className="flex flex-wrap justify-end gap-2">
                            <Link
                              href={routes.coordinador.reportePhDetalle(r.id)}
                              className={COORD_BTN_PRIMARY}
                            >
                              Ver
                            </Link>
                            <button
                              type="button"
                              className={COORD_BTN_DANGER}
                              onClick={() => openDeleteConfirm(r)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </Td>
                      </Tr>
                    )
                  })
                : null}
            </tbody>
          </ModernTable>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={deleteConfirm.open}
        title="Eliminar reporte PH"
        description={deleteDialogDescription}
        confirmLabel="Eliminar definitivamente"
        cancelLabel="Cancelar"
        destructive
        onCancel={closeDeleteConfirm}
        onConfirm={executeDelete}
      />
    </div>
  )
}
