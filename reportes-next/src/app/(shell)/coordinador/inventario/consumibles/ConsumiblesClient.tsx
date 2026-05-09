'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataField } from '@/components/ui/DataField'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { ModernTable, Td, Th } from '@/components/ui/ModernTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { get } from '@/lib/api'
import { formatDateTimeEsAr } from '@/lib/date'
import type { Consumible } from '@/lib/types/inventario'
import { stockLabel, stockState } from '@/lib/stock'

/** Respuesta de GET /consumibles/:id/movimientos */
type MovimientoConsumibleApi = {
  id?: string
  fecha: string
  tipo_movimiento: string | null
  cantidad_anterior?: number | string | null
  cantidad_movimiento?: number | string | null
  cantidad_nueva?: number | string | null
  usuario: string | null
  observaciones?: string | null
}

type GetConsumiblesIdMovimientosResponse = {
  ok: boolean
  movimientos: MovimientoConsumibleApi[]
}

function displayQty(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number' && !Number.isNaN(v)) return String(v)
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : String(v)
}

function formatMovimientoCantidad(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return String(v)
  if (n > 0) return `+${n}`
  return String(n)
}

function tipoMovimientoBadgeVariant(
  tipo: string | null | undefined
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' {
  const t = String(tipo ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (t === 'ingreso') return 'success'
  if (t === 'egreso') return 'warning'
  if (t === 'ajuste') return 'info'
  return 'neutral'
}

function tipoMovimientoLabel(tipo: string | null | undefined): string {
  const raw = String(tipo ?? '').trim()
  if (!raw) return 'Movimiento'
  return raw.replace(/_/g, ' ')
}

function sortMovimientosByFechaDesc(list: MovimientoConsumibleApi[]): MovimientoConsumibleApi[] {
  return [...list].sort((a, b) => {
    const ta = new Date(String(a.fecha)).getTime()
    const tb = new Date(String(b.fecha)).getTime()
    const na = Number.isNaN(ta) ? 0 : ta
    const nb = Number.isNaN(tb) ? 0 : tb
    return nb - na
  })
}

export function ConsumiblesClient() {
  const params = useSearchParams()
  const filtro = params.get('filtro') // stock_bajo | sin_stock | ok | null

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<Consumible[]>([])
  const [query, setQuery] = React.useState('')

  const [historialConsumible, setHistorialConsumible] = React.useState<Consumible | null>(null)
  const [historialLoading, setHistorialLoading] = React.useState(false)
  const [historialError, setHistorialError] = React.useState<string | null>(null)
  const [historialMovimientos, setHistorialMovimientos] = React.useState<MovimientoConsumibleApi[]>([])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const data = await get<Consumible[]>('/consumibles')
        if (cancelled) return
        setItems(data || [])
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

  React.useEffect(() => {
    if (!historialConsumible) return
    let cancelled = false
    const id = historialConsumible.id

    async function loadHistorial() {
      setHistorialLoading(true)
      setHistorialError(null)
      setHistorialMovimientos([])
      try {
        const data = await get<GetConsumiblesIdMovimientosResponse>(
          `/consumibles/${encodeURIComponent(id)}/movimientos`
        )
        if (cancelled) return
        if (!data || data.ok !== true) {
          setHistorialError('No se pudo leer el historial (respuesta inválida).')
          setHistorialMovimientos([])
          return
        }
        setHistorialMovimientos(Array.isArray(data.movimientos) ? data.movimientos : [])
      } catch (e) {
        if (cancelled) return
        setHistorialError(e instanceof Error ? e.message : String(e))
        setHistorialMovimientos([])
      } finally {
        if (!cancelled) setHistorialLoading(false)
      }
    }

    void loadHistorial()
    return () => {
      cancelled = true
    }
  }, [historialConsumible])

  function closeHistorialModal() {
    setHistorialConsumible(null)
    setHistorialLoading(false)
    setHistorialError(null)
    setHistorialMovimientos([])
  }

  const summary = React.useMemo(() => {
    const total = items.length
    const bajo = items.filter((c) => stockState(c) === 'stock_bajo').length
    const sin = items.filter((c) => stockState(c) === 'sin_stock').length
    const ok = items.filter((c) => stockState(c) === 'ok').length
    return { total, bajo, sin, ok }
  }, [items])

  const filtered = React.useMemo(() => {
    let list = [...items]

    if (filtro === 'stock_bajo') list = list.filter((c) => stockState(c) === 'stock_bajo')
    if (filtro === 'sin_stock') list = list.filter((c) => stockState(c) === 'sin_stock')
    if (filtro === 'ok') list = list.filter((c) => stockState(c) === 'ok')

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((c) => {
        const hay = [c.descripcion, c.categoria, c.ubicacion, c.observaciones]
          .map((x) => String(x || '').toLowerCase())
          .join(' ')
        return hay.includes(q)
      })
    }

    return list
  }, [items, filtro, query])

  const movimientosOrdenados = React.useMemo(
    () => sortMovimientosByFechaDesc(historialMovimientos),
    [historialMovimientos]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consumibles"
        subtitle="Control de materiales, stock mínimo y estados."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardBody className="p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Total consumibles
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">
              {loading ? '—' : summary.total}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Stock bajo
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">
              {loading ? '—' : summary.bajo}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Sin stock
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">
              {loading ? '—' : summary.sin}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Stock OK
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">
              {loading ? '—' : summary.ok}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <div className="text-lg font-semibold">Listado de consumibles</div>
            <div className="mt-1 text-sm text-muted">
              Datos en vivo desde <code className="font-mono">GET /consumibles</code>.
            </div>
          </div>
          <StatusBadge variant="info">{filtro ? `Filtro: ${filtro}` : 'Sin filtro'}</StatusBadge>
        </CardHeader>
        <CardBody>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:ring-4 focus:ring-black/5 dark:focus:ring-white/10 md:max-w-md"
              placeholder="Buscar por descripción, categoría, ubicación u observaciones…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <StatusBadge variant="neutral">Solo lectura (GET)</StatusBadge>
          </div>

          {loading ? <LoadingState label="Cargando consumibles…" /> : null}
          {error ? (
            <InlineMessage
              kind="error"
              title="No se pudieron cargar los consumibles"
              description={error}
              className="mb-4"
            />
          ) : null}

          <ModernTable>
            <thead>
              <tr>
                <Th>Descripción</Th>
                <Th>Categoría</Th>
                <Th>Cantidad</Th>
                <Th>Stock mínimo</Th>
                <Th>Estado stock</Th>
                <Th>Ubicación</Th>
                <Th>Observaciones</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {!loading && !error && filtered.length === 0 ? (
                <tr>
                  <Td colSpan={8}>
                    <EmptyState
                      title="No hay consumibles para mostrar"
                      description="Probá cambiar filtros o búsqueda."
                    />
                  </Td>
                </tr>
              ) : null}

              {!loading && !error
                ? filtered.map((c) => {
                    const st = stockState(c)
                    const variant =
                      st === 'sin_stock' ? 'danger' : st === 'stock_bajo' ? 'warning' : 'success'

                    return (
                      <tr key={c.id}>
                        <Td className="font-semibold">{c.descripcion || ''}</Td>
                        <Td>{c.categoria || ''}</Td>
                        <Td>
                          <strong>{c.cantidad ?? 0}</strong>
                        </Td>
                        <Td>{c.stock_minimo ?? 0}</Td>
                        <Td>
                          <StatusBadge variant={variant}>{stockLabel(st)}</StatusBadge>
                        </Td>
                        <Td>{c.ubicacion || ''}</Td>
                        <Td>{c.observaciones || ''}</Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => setHistorialConsumible(c)}
                            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-2"
                          >
                            Historial
                          </button>
                        </Td>
                      </tr>
                    )
                  })
                : null}
            </tbody>
          </ModernTable>
        </CardBody>
      </Card>

      <Modal
        open={historialConsumible !== null}
        onClose={closeHistorialModal}
        title="Historial del consumible"
        className="max-h-[90vh] max-w-3xl overflow-hidden"
      >
        {historialConsumible ? (
          <div className="max-h-[calc(90vh-8rem)] space-y-6 overflow-y-auto pr-1">
            <div>
              <div className="mb-3 text-sm font-semibold text-app">Consumible</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DataField label="Descripción" value={historialConsumible.descripcion || ''} />
                <DataField label="Categoría" value={historialConsumible.categoria || ''} />
                <DataField label="Cantidad actual" value={String(historialConsumible.cantidad ?? 0)} />
                <DataField label="Stock mínimo" value={String(historialConsumible.stock_minimo ?? 0)} />
                <DataField label="Ubicación" value={historialConsumible.ubicacion || ''} />
                <DataField label="Observaciones" value={historialConsumible.observaciones || ''} />
              </div>
            </div>

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-app">Historial de movimientos</span>
                <code className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted">
                  GET /consumibles/{historialConsumible.id}/movimientos
                </code>
              </div>

              {historialLoading ? (
                <LoadingState label="Cargando movimientos…" />
              ) : historialError ? (
                <InlineMessage kind="error" title="No se pudo cargar el historial" description={historialError} />
              ) : movimientosOrdenados.length === 0 ? (
                <EmptyState
                  title="Sin movimientos registrados"
                  description="No hay eventos de movimiento de stock para este consumible."
                />
              ) : (
                <ul className="relative space-y-4 border-l-2 border-border pl-4 sm:pl-5">
                  {movimientosOrdenados.map((m, idx) => {
                    const key = m.id ?? `${idx}-${m.fecha}`
                    const fechaFmt = formatDateTimeEsAr(m.fecha) || String(m.fecha || '—')
                    const obs = String(m.observaciones ?? '').trim()

                    return (
                      <li key={key} className="relative">
                        <span className="absolute -left-[17px] top-2 h-2 w-2 rounded-full bg-[var(--color-brand)] ring-4 ring-surface sm:-left-[21px] sm:h-2.5 sm:w-2.5" />
                        <div className="rounded-2xl border border-border bg-surface-2 p-3 sm:p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                                Fecha
                              </div>
                              <div className="mt-0.5 text-sm font-semibold text-app">{fechaFmt}</div>
                            </div>
                            <StatusBadge variant={tipoMovimientoBadgeVariant(m.tipo_movimiento)}>
                              {tipoMovimientoLabel(m.tipo_movimiento)}
                            </StatusBadge>
                          </div>

                          {m.usuario ? (
                            <div className="mt-3 text-sm">
                              <span className="text-muted">Usuario:</span>{' '}
                              <span className="font-medium">{m.usuario}</span>
                            </div>
                          ) : null}

                          <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface p-3 text-sm">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                                Stock
                              </div>
                              <div className="mt-0.5 font-medium">
                                {displayQty(m.cantidad_anterior)} → {displayQty(m.cantidad_nueva)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                                Movimiento
                              </div>
                              <div className="mt-0.5 font-medium">
                                {formatMovimientoCantidad(m.cantidad_movimiento)}
                              </div>
                            </div>
                          </div>

                          {obs ? (
                            <div className="mt-3 text-sm">
                              <span className="text-muted">Observaciones:</span>
                              <div className="mt-1 whitespace-pre-wrap font-medium">{m.observaciones}</div>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
