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
import { COORD_INPUT_LG } from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'
import { formatDateDDMMYYYY, formatDateTimeEsAr } from '@/lib/date'
import type { Activo } from '@/lib/types/inventario'
import { vencimientoLabel } from '@/lib/status'
import { vencimientoState } from '@/lib/vencimientos'

const FILTER_COLUMNS = [
  { key: 'descripcion' as const, label: 'Descripción' },
  { key: 'categoria' as const, label: 'Categoría' },
  { key: 'numero_serie' as const, label: 'N° Serie' },
  { key: 'marca' as const, label: 'Marca' },
  { key: 'ubicacion' as const, label: 'Ubicación' },
  { key: 'asignado_a' as const, label: 'Asignado a' },
  { key: 'vencimiento' as const, label: 'Vencimiento' },
  { key: 'estado' as const, label: 'Estado' },
]

type FilterColumnKey = (typeof FILTER_COLUMNS)[number]['key']

function normalizeEmpty(v: unknown): string {
  if (v == null) return 'Sin dato'
  const t = String(v).trim()
  return t === '' ? 'Sin dato' : t
}

function columnDisplayValue(row: Activo, key: FilterColumnKey): string {
  if (key === 'vencimiento') {
    const f = formatDateDDMMYYYY(row.vencimiento)
    return normalizeEmpty(f)
  }
  return normalizeEmpty(row[key])
}

/** Valores únicos normalizados (vacío → «Sin dato», comparación estable). */
function getUniqueValues(items: Activo[], key: FilterColumnKey): string[] {
  const set = new Set<string>()
  for (const it of items) {
    set.add(columnDisplayValue(it, key))
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

/** Respuesta de GET /activos/:id/movimientos (contrato backend). */
type MovimientoActivoApi = {
  id?: string
  fecha: string
  tipo_movimiento: string | null
  descripcion: string | null
  usuario: string | null
  estado_anterior?: string | null
  estado_nuevo?: string | null
  ubicacion_anterior?: string | null
  ubicacion_nueva?: string | null
  asignado_anterior?: string | null
  asignado_nuevo?: string | null
  observaciones?: string | null
}

type GetActivosIdMovimientosResponse = {
  ok: boolean
  movimientos: MovimientoActivoApi[]
}

function displayMovValue(v: string | null | undefined): string {
  const t = String(v ?? '').trim()
  return t === '' ? '—' : t
}

function hasMovimientoChange(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return String(a ?? '').trim() !== String(b ?? '').trim()
}

function tipoMovimientoBadgeVariant(
  tipo: string | null | undefined
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' {
  const t = String(tipo ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  const map: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'> = {
    creacion: 'success',
    edicion: 'info',
    traslado: 'accent',
    baja: 'danger',
    reparacion: 'warning',
    asignacion: 'info',
  }
  return map[t] ?? 'neutral'
}

function tipoMovimientoLabel(tipo: string | null | undefined): string {
  const raw = String(tipo ?? '').trim()
  if (!raw) return 'Movimiento'
  return raw.replace(/_/g, ' ')
}

function sortMovimientosByFechaDesc(list: MovimientoActivoApi[]): MovimientoActivoApi[] {
  return [...list].sort((a, b) => {
    const ta = new Date(String(a.fecha)).getTime()
    const tb = new Date(String(b.fecha)).getTime()
    const na = Number.isNaN(ta) ? 0 : ta
    const nb = Number.isNaN(tb) ? 0 : tb
    return nb - na
  })
}

export function ActivosClient() {
  const params = useSearchParams()
  const categoria = params.get('categoria')
  const filtro = params.get('filtro') // vencidos | criticos | vencimientos | fuera_servicio | null

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<Activo[]>([])
  const [query, setQuery] = React.useState('')

  const [columnFilters, setColumnFilters] = React.useState<Record<string, string>>({})
  const [openFilter, setOpenFilter] = React.useState<FilterColumnKey | null>(null)
  const dropdownRef = React.useRef<HTMLDivElement | null>(null)

  const [historialActivo, setHistorialActivo] = React.useState<Activo | null>(null)
  const [historialLoading, setHistorialLoading] = React.useState(false)
  const [historialError, setHistorialError] = React.useState<string | null>(null)
  const [historialMovimientos, setHistorialMovimientos] = React.useState<MovimientoActivoApi[]>([])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)

        const path = categoria ? `/activos?categoria=${encodeURIComponent(categoria)}` : '/activos'
        const data = await get<Activo[]>(path)

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
  }, [categoria])

  React.useEffect(() => {
    if (!openFilter) return
    function handleMouseDown(e: MouseEvent) {
      const el = dropdownRef.current
      const t = e.target
      if (!(t instanceof Node)) return
      if (el?.contains(t)) return
      if ((t as HTMLElement).closest?.('[data-filter-trigger]')) return
      setOpenFilter(null)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [openFilter])

  React.useEffect(() => {
    if (!historialActivo) return
    let cancelled = false
    const id = historialActivo.id

    async function loadHistorial() {
      setHistorialLoading(true)
      setHistorialError(null)
      setHistorialMovimientos([])
      try {
        const data = await get<GetActivosIdMovimientosResponse>(
          `/activos/${encodeURIComponent(id)}/movimientos`
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
  }, [historialActivo])

  function closeHistorialModal() {
    setHistorialActivo(null)
    setHistorialLoading(false)
    setHistorialError(null)
    setHistorialMovimientos([])
  }

  const filtered = React.useMemo(() => {
    let list = [...items]

    if (filtro) {
      if (filtro === 'vencidos') {
        list = list.filter((a) => vencimientoState(a.vencimiento).state === 'vencido')
      }
      if (filtro === 'criticos') {
        list = list.filter((a) => vencimientoState(a.vencimiento).state === 'critico')
      }
      if (filtro === 'vencimientos') {
        list = list.filter((a) => vencimientoState(a.vencimiento).state === 'proximo')
      }
      if (filtro === 'fuera_servicio') {
        list = list.filter(
          (a) =>
            a.estado === 'fuera_de_servicio' ||
            a.estado === 'en_reparacion' ||
            a.estado === 'vencido'
        )
      }
    }

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((a) => {
        const hay = [
          a.descripcion,
          a.categoria,
          a.numero_serie,
          a.marca,
          a.ubicacion,
          a.asignado_a,
          a.estado,
          formatDateDDMMYYYY(a.vencimiento),
        ]
          .map((x) => String(x || '').toLowerCase())
          .join(' ')
        return hay.includes(q)
      })
    }

    for (const k of FILTER_COLUMNS) {
      const sel = columnFilters[k.key]?.trim()
      if (!sel) continue
      const want = sel.toLowerCase()
      list = list.filter(
        (a) => columnDisplayValue(a, k.key).toLowerCase() === want
      )
    }

    return list
  }, [items, filtro, query, columnFilters])

  const activeColumnFilters = React.useMemo(
    () =>
      FILTER_COLUMNS.flatMap(({ key }) => {
        const v = columnFilters[key]?.trim()
        return v ? [{ key, value: v }] : []
      }),
    [columnFilters]
  )

  function clearColumnFilters() {
    setColumnFilters({})
    setOpenFilter(null)
  }

  function selectColumnOption(col: FilterColumnKey, option: string) {
    setOpenFilter(null)
    if (option === 'Todos') {
      setColumnFilters((prev) => {
        const next = { ...prev }
        delete next[col]
        return next
      })
      return
    }
    setColumnFilters((prev) => ({ ...prev, [col]: option }))
  }

  const movimientosOrdenados = React.useMemo(
    () => sortMovimientosByFechaDesc(historialMovimientos),
    [historialMovimientos]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activos"
        subtitle="Consulta de activos, certificaciones y vencimientos."
      />

      <Card>
        <CardHeader>
          <div>
            <div className="text-lg font-semibold">Listado de activos</div>
            <div className="mt-1 text-sm text-muted">
              Datos en vivo desde <code className="font-mono">GET /activos</code>.
            </div>
          </div>
          <StatusBadge variant="info">
            {categoria ? `Categoría: ${categoria}` : 'Todas las categorías'}
          </StatusBadge>
        </CardHeader>
        <CardBody>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              className={`${COORD_INPUT_LG} md:max-w-md`}
              placeholder="Buscar por descripción, serie, ubicación, estado…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge variant="neutral">
                {filtro ? `Filtro URL: ${filtro}` : 'Sin filtro URL'}
              </StatusBadge>
              {activeColumnFilters.length > 0 ? (
                <>
                  <StatusBadge variant="accent">
                    Filtros columna: {activeColumnFilters.length}
                  </StatusBadge>
                  <button
                    type="button"
                    onClick={clearColumnFilters}
                    className="h-9 rounded-xl border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2"
                  >
                    Limpiar filtros
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {activeColumnFilters.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2 text-sm text-muted">
              <span className="font-semibold text-app">Activos:</span>
              {activeColumnFilters.map(({ key, value }) => {
                const label = FILTER_COLUMNS.find((c) => c.key === key)?.label ?? key
                return (
                  <span
                    key={key}
                    className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-app"
                  >
                    {label}: {value}
                  </span>
                )
              })}
            </div>
          ) : null}

          {loading ? <LoadingState label="Cargando activos…" /> : null}
          {error ? (
            <InlineMessage
              kind="error"
              title="No se pudieron cargar los activos"
              description={error}
              className="mb-4"
            />
          ) : null}

          <ModernTable>
            <thead>
              <tr>
                {FILTER_COLUMNS.map(({ key, label }) => {
                  const active = Boolean(columnFilters[key]?.trim())
                  const options = getUniqueValues(items, key)
                  return (
                    <Th key={key} className="relative align-top">
                      <button
                        type="button"
                        data-filter-trigger={key}
                        onClick={() =>
                          setOpenFilter((cur) => (cur === key ? null : key))
                        }
                        className={cn(
                          'flex w-full items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide transition hover:text-app',
                          active ? 'text-app' : 'text-muted'
                        )}
                      >
                        <span className="min-w-0 flex-1 leading-snug">{label}</span>
                        <span className="shrink-0 text-[10px] opacity-70" aria-hidden>
                          ▾
                        </span>
                        {active ? (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand)]"
                            title="Filtro activo"
                          />
                        ) : null}
                      </button>
                      {openFilter === key ? (
                        <div
                          ref={dropdownRef}
                          className="absolute left-0 top-full z-30 mt-1 max-h-64 min-w-[220px] overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-[var(--shadow-app)]"
                          role="listbox"
                        >
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2"
                            onClick={() => selectColumnOption(key, 'Todos')}
                          >
                            Todos
                          </button>
                          <div className="border-t border-border" />
                          {options.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              className={cn(
                                'block w-full px-3 py-2 text-left text-sm hover:bg-surface-2',
                                columnFilters[key] === opt && 'bg-surface-2 font-semibold'
                              )}
                              onClick={() => selectColumnOption(key, opt)}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </Th>
                  )
                })}
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {!loading && !error && filtered.length === 0 ? (
                <tr>
                  <Td colSpan={9}>
                    <EmptyState
                      title="No hay activos para mostrar"
                      description="Probá cambiar filtros o búsqueda."
                    />
                  </Td>
                </tr>
              ) : null}

              {!loading && !error
                ? filtered.map((a) => {
                    const v = vencimientoState(a.vencimiento)
                    const vencVariant: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' =
                      v.state === 'vencido'
                        ? 'danger'
                        : v.state === 'critico'
                        ? 'warning'
                        : v.state === 'proximo'
                        ? 'accent'
                        : v.state === 'ok'
                        ? 'success'
                        : 'neutral'

                    const descripcion = columnDisplayValue(a, 'descripcion')
                    const categoriaCell = columnDisplayValue(a, 'categoria')
                    const serie = columnDisplayValue(a, 'numero_serie')
                    const marca = columnDisplayValue(a, 'marca')
                    const ubicacion = columnDisplayValue(a, 'ubicacion')
                    const asignado = columnDisplayValue(a, 'asignado_a')
                    const vencTxt = columnDisplayValue(a, 'vencimiento')
                    const estadoTxt = columnDisplayValue(a, 'estado')

                    return (
                      <tr key={a.id}>
                        <Td className="font-semibold">{descripcion}</Td>
                        <Td>{categoriaCell}</Td>
                        <Td>{serie}</Td>
                        <Td>{marca}</Td>
                        <Td>{ubicacion}</Td>
                        <Td>{asignado}</Td>
                        <Td>
                          <div className="flex flex-col gap-1">
                            <div className="text-sm">{vencTxt}</div>
                            <StatusBadge variant={vencVariant}>
                              {vencimientoLabel(v.state, v.days)}
                            </StatusBadge>
                          </div>
                        </Td>
                        <Td>
                          <StatusBadge variant="neutral">{estadoTxt}</StatusBadge>
                        </Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => setHistorialActivo(a)}
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
        open={historialActivo !== null}
        onClose={closeHistorialModal}
        title="Historial del activo"
        className="max-h-[90vh] max-w-3xl overflow-hidden"
      >
        {historialActivo ? (
          <div className="max-h-[calc(90vh-8rem)] space-y-6 overflow-y-auto pr-1">
            <div>
              <div className="mb-3 text-sm font-semibold text-app">
                Información principal
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DataField label="Descripción" value={columnDisplayValue(historialActivo, 'descripcion')} />
                <DataField label="Categoría" value={columnDisplayValue(historialActivo, 'categoria')} />
                <DataField label="Número de serie" value={columnDisplayValue(historialActivo, 'numero_serie')} />
                <DataField label="Marca" value={columnDisplayValue(historialActivo, 'marca')} />
                <DataField label="Ubicación actual" value={columnDisplayValue(historialActivo, 'ubicacion')} />
                <DataField label="Asignado a" value={columnDisplayValue(historialActivo, 'asignado_a')} />
                <DataField label="Vencimiento" value={columnDisplayValue(historialActivo, 'vencimiento')} />
                <DataField label="Estado" value={columnDisplayValue(historialActivo, 'estado')} />
              </div>
            </div>

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-app">Historial de movimientos</span>
                <code className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted">
                  GET /activos/{historialActivo.id}/movimientos
                </code>
              </div>

              {historialLoading ? (
                <LoadingState label="Cargando movimientos…" />
              ) : historialError ? (
                <InlineMessage kind="error" title="No se pudo cargar el historial" description={historialError} />
              ) : movimientosOrdenados.length === 0 ? (
                <EmptyState
                  title="Sin movimientos registrados"
                  description="No hay eventos de movimiento para este activo."
                />
              ) : (
                <ul className="relative space-y-4 border-l-2 border-border pl-4 sm:pl-5">
                  {movimientosOrdenados.map((m, idx) => {
                    const key = m.id ?? `${idx}-${m.fecha}`
                    const fechaFmt = formatDateTimeEsAr(m.fecha) || displayMovValue(m.fecha)
                    const showEstado = hasMovimientoChange(m.estado_anterior, m.estado_nuevo)
                    const showUbicacion = hasMovimientoChange(
                      m.ubicacion_anterior,
                      m.ubicacion_nueva
                    )
                    const showAsignacion = hasMovimientoChange(
                      m.asignado_anterior,
                      m.asignado_nuevo
                    )
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

                          {m.descripcion ? (
                            <div className="mt-3 text-sm">
                              <span className="text-muted">Descripción:</span>{' '}
                              <span className="font-medium">{m.descripcion}</span>
                            </div>
                          ) : null}

                          {m.usuario ? (
                            <div className="mt-2 text-sm">
                              <span className="text-muted">Usuario:</span>{' '}
                              <span className="font-medium">{m.usuario}</span>
                            </div>
                          ) : null}

                          {(showEstado || showUbicacion || showAsignacion) && (
                            <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface p-3 text-sm">
                              {showEstado ? (
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                                    Estado
                                  </div>
                                  <div className="mt-0.5 font-medium break-words">
                                    {displayMovValue(m.estado_anterior)} →{' '}
                                    {displayMovValue(m.estado_nuevo)}
                                  </div>
                                </div>
                              ) : null}
                              {showUbicacion ? (
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                                    Ubicación
                                  </div>
                                  <div className="mt-0.5 font-medium break-words">
                                    {displayMovValue(m.ubicacion_anterior)} →{' '}
                                    {displayMovValue(m.ubicacion_nueva)}
                                  </div>
                                </div>
                              ) : null}
                              {showAsignacion ? (
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                                    Asignación
                                  </div>
                                  <div className="mt-0.5 font-medium break-words">
                                    {displayMovValue(m.asignado_anterior)} →{' '}
                                    {displayMovValue(m.asignado_nuevo)}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}

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
