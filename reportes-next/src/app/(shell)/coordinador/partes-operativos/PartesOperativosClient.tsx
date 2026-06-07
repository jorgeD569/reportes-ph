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
import { get, post } from '@/lib/api'
import { routes } from '@/lib/constants/routes'
import {
  COORD_BTN_PRIMARY,
  COORD_BTN_SECONDARY,
  COORD_INPUT_LG,
} from '@/lib/coordinador/theme'
import { formatFechaSoloDia } from '@/lib/date'
import {
  parteOperativoPdfUrl,
  parteOperativoTienePdf,
} from '@/lib/parte-operativo-list'
import {
  parteOperativoListState,
  parteOperativoListStateLabel,
  parteOperativoListStateVariant,
} from '@/lib/status'
import type {
  CerrarParteOperativoResponse,
  GetPartesOperativosResponse,
  ParteOperativoListItem,
} from '@/lib/types/partes-operativos'

function unidadLabel(parte: ParteOperativoListItem) {
  return parte.unidad || parte.unidad_pesada || '—'
}

export function PartesOperativosClient() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<ParteOperativoListItem[]>([])
  const [query, setQuery] = React.useState('')
  const [cerrandoId, setCerrandoId] = React.useState<string | null>(null)
  const [actionInfo, setActionInfo] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const data = await get<GetPartesOperativosResponse>('/partes-operativos')
    setItems(data.partes || [])
  }, [])

  React.useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        setLoading(true)
        setError(null)
        await load()
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
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
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((p) => {
      const haystack = [
        p.numero_parte,
        p.pozo,
        p.yacimiento,
        p.operadora,
        p.unidad,
        p.unidad_pesada,
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }, [items, query])

  async function cerrarYGenerarPdf(parte: ParteOperativoListItem) {
    try {
      setCerrandoId(parte.id)
      setActionInfo(null)
      setError(null)

      const data = await post<CerrarParteOperativoResponse>(
        `/partes-operativos/${encodeURIComponent(parte.id)}/cerrar`,
        {}
      )

      if (data.ok === false) {
        throw new Error(data.error || 'No se pudo cerrar el parte')
      }

      const pdfUrl = typeof data.pdf_url === 'string' ? data.pdf_url.trim() : ''
      if (pdfUrl) {
        window.open(pdfUrl, '_blank', 'noopener,noreferrer')
      }

      setActionInfo(
        pdfUrl
          ? 'Parte cerrado y PDF generado correctamente.'
          : 'Parte cerrado. Actualizá el listado si no ves el PDF.'
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cerrar el parte')
    } finally {
      setCerrandoId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partes Operativos"
        subtitle="Listado de partes generados."
      />

      <Card>
        <CardHeader>
          <div>
            <div className="text-lg font-semibold">Listado</div>
            <div className="mt-1 text-sm text-muted">
              Datos en vivo desde{' '}
              <code className="font-mono">GET /partes-operativos</code>.
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="mb-4">
            <input
              className={`${COORD_INPUT_LG} md:max-w-lg`}
              placeholder="Buscar por N° parte, pozo, yacimiento, operadora o unidad…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {actionInfo ? (
            <InlineMessage kind="success" title={actionInfo} className="mb-4" />
          ) : null}

          {loading ? <LoadingState label="Cargando partes operativos…" /> : null}
          {error ? (
            <InlineMessage
              kind="error"
              title="No se pudieron cargar los partes"
              description={error}
              className="mb-4"
            />
          ) : null}

          <ModernTable>
            <thead>
              <tr>
                <Th>N° Parte</Th>
                <Th>Fecha</Th>
                <Th>Pozo</Th>
                <Th>Yacimiento</Th>
                <Th>Operadora</Th>
                <Th>Unidad</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {!loading && !error && filtered.length === 0 ? (
                <tr>
                  <Td colSpan={8}>
                    <EmptyState
                      title="No hay partes para mostrar"
                      description="Probá cambiar la búsqueda."
                    />
                  </Td>
                </tr>
              ) : null}

              {!loading && !error
                ? filtered.map((p) => {
                    if (String(p.numero_parte) === '14') {
                      console.log('DEBUG PARTE OPERATIVO LISTADO', p)
                    }

                    const st = parteOperativoListState(
                      p as ParteOperativoListItem & Record<string, unknown>
                    )
                    const tienePdf = parteOperativoTienePdf(
                      p as ParteOperativoListItem & Record<string, unknown>
                    )
                    const puedeCerrar = st === 'abierto' || st === 'pendiente_cierre'
                    const pdfUrl = parteOperativoPdfUrl(
                      p as ParteOperativoListItem & Record<string, unknown>
                    )

                    return (
                      <tr key={p.id}>
                        <Td className="font-semibold">{p.numero_parte ?? '—'}</Td>
                        <Td>{formatFechaSoloDia(p.fecha || p.created_at)}</Td>
                        <Td>{p.pozo || '—'}</Td>
                        <Td>{p.yacimiento || '—'}</Td>
                        <Td>{p.operadora || '—'}</Td>
                        <Td>{unidadLabel(p)}</Td>
                        <Td>
                          <StatusBadge variant={parteOperativoListStateVariant(st)}>
                            {parteOperativoListStateLabel(st)}
                          </StatusBadge>
                        </Td>
                        <Td className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Link
                              href={routes.operador.parteOperativo(p.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={COORD_BTN_SECONDARY}
                            >
                              Ver / Continuar
                            </Link>
                            {tienePdf && pdfUrl && (
                              <a
                                href={pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={COORD_BTN_PRIMARY}
                              >
                                Ver PDF
                              </a>
                            )}
                            {puedeCerrar ? (
                              <button
                                type="button"
                                className={COORD_BTN_PRIMARY}
                                disabled={cerrandoId === p.id}
                                onClick={() => void cerrarYGenerarPdf(p)}
                              >
                                {cerrandoId === p.id
                                  ? 'Generando…'
                                  : 'Generar PDF'}
                              </button>
                            ) : null}
                          </div>
                        </Td>
                      </tr>
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
