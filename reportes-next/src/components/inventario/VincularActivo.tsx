'use client'

import * as React from 'react'
import { Info, X } from 'lucide-react'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { Modal } from '@/components/ui/Modal'
import { ApiError, get, post } from '@/lib/api'
import { readAppUsuario } from '@/lib/auth'
import { cn } from '@/lib/cn'
import {
  COORD_BTN_PRIMARY,
  COORD_BTN_SECONDARY,
  COORD_INPUT_LG,
  COORD_LABEL,
  COORD_TEXT,
  COORD_TEXT_MUTED,
} from '@/lib/coordinador/theme'
import { formatFechaSoloDia } from '@/lib/date'
import {
  labelCategoria,
  labelEstadoOperativo,
  newClientUuid,
  normalizeEstadoKey,
} from '@/lib/inventario/labels'
import type {
  Activo,
  PostComponenteResponse,
  PostTraspasoResponse,
} from '@/lib/types/inventario'

export const VINCULAR_ACTIVO_LABEL = '+ Vincular activo'
export const VINCULAR_ACTIVO_TITLE = 'Vincular activo'
export const VINCULAR_ACTIVO_FIELD = 'Número de serie del activo'
export const VINCULAR_ACTIVO_CONFIRM = 'Vincular activo'
export const ACTIVOS_VINCULADOS_TITLE = 'Activos vinculados'
export const MSG_FUERA_DE_SERVICIO =
  'Este activo está fuera de servicio y no puede vincularse. Primero debe cambiarse su estado.'

const MIN_QUERY_CHARS = 2
const SEARCH_DEBOUNCE_MS = 250
const MAX_SUGGESTIONS = 10

/** Normaliza para comparación exacta (trim + mayúsculas). */
export function normalizeSerieKey(raw: string): string {
  return String(raw || '').trim().toUpperCase()
}

/** Compacta espacios/guiones/puntos/guiones bajos para coincidencias tolerantes. */
function compactSerie(raw: string): string {
  return normalizeSerieKey(raw).replace(/[\s\-_.]/g, '')
}

/**
 * Coincide solo sobre `numero_serie` (nunca descripción/nombre).
 */
export function matchNumeroSerieQuery(
  query: string,
  numeroSerie: string | null | undefined,
): boolean {
  const q = normalizeSerieKey(query)
  if (!q) return false
  const s = normalizeSerieKey(String(numeroSerie || ''))
  if (!s) return false
  if (s.includes(q)) return true
  const qc = compactSerie(q)
  const sc = compactSerie(s)
  return qc.length > 0 && sc.includes(qc)
}

function usuarioActual(): string {
  const u = readAppUsuario()
  return u?.nombre?.trim() || u?.usuario?.trim() || 'Coordinador'
}

export function conjuntoDisplayName(opts: {
  descripcion?: string | null
  numero_serie?: string | null
  id?: string | number | null
}): string {
  const desc = String(opts.descripcion || '').trim()
  const serie = String(opts.numero_serie || '').trim()
  if (serie) return serie
  return desc || String(opts.id ?? 'desconocido')
}

function readNumeroSerie(activo: Activo): string {
  return String(activo.numero_serie || '').trim()
}

export function isFueraDeServicioEstado(
  estado: string | null | undefined,
): boolean {
  return normalizeEstadoKey(estado) === 'fuera de servicio'
}

export type VincularBlockReason =
  | 'es_conjunto'
  | 'mismo_conjunto'
  | 'ya_en_lista'
  | 'fuera_de_servicio'
  | 'en_otro_conjunto'

export type VincularCandidate = {
  activo: Activo
  available: boolean
  /** Motivo si no está disponible para vincular. */
  message?: string
  blockReason?: VincularBlockReason
  canTraspaso?: boolean
  origenConjuntoId?: string
  origenConjuntoLabel?: string
}

export type VincularLookupResult =
  | { status: 'matches'; query: string; candidates: VincularCandidate[] }
  | { status: 'not_found'; serie: string; message: string }
  | { status: 'error'; serie: string; message: string }

/**
 * Disponibilidad ≠ estado operativo.
 * Un activo operativo puede no estar disponible si ya está vinculado.
 */
export function assessAvailability(
  act: Activo,
  opts: {
    query: string
    conjuntoId?: string | number | null
    conjuntoSerie?: string | null
    excludeActivoIds?: Array<string | number>
    excludeSeries?: string[]
  },
): VincularCandidate {
  const serieLabel = readNumeroSerie(act) || normalizeSerieKey(opts.query)

  if (act.es_conjunto === true) {
    return {
      activo: act,
      available: false,
      blockReason: 'es_conjunto',
      message: `El activo ${serieLabel} es un conjunto y no puede vincularse como activo.`,
    }
  }

  if (
    opts.conjuntoId != null &&
    String(act.id) === String(opts.conjuntoId)
  ) {
    return {
      activo: act,
      available: false,
      blockReason: 'mismo_conjunto',
      message: 'El conjunto no puede vincularse a sí mismo.',
    }
  }

  const conjSerie = normalizeSerieKey(opts.conjuntoSerie || '')
  if (conjSerie && normalizeSerieKey(serieLabel) === conjSerie) {
    return {
      activo: act,
      available: false,
      blockReason: 'mismo_conjunto',
      message: 'El conjunto no puede vincularse a sí mismo.',
    }
  }

  const excludeIds = new Set(
    (opts.excludeActivoIds || []).map((id) => String(id)),
  )
  if (excludeIds.has(String(act.id))) {
    return {
      activo: act,
      available: false,
      blockReason: 'ya_en_lista',
      message: `El activo ${serieLabel} ya está en la lista de este conjunto.`,
    }
  }

  const excludeSeries = new Set(
    (opts.excludeSeries || []).map(normalizeSerieKey).filter(Boolean),
  )
  if (excludeSeries.has(normalizeSerieKey(serieLabel))) {
    return {
      activo: act,
      available: false,
      blockReason: 'ya_en_lista',
      message: `El activo ${serieLabel} ya está en la lista de este conjunto.`,
    }
  }

  if (isFueraDeServicioEstado(act.estado)) {
    return {
      activo: act,
      available: false,
      blockReason: 'fuera_de_servicio',
      message: MSG_FUERA_DE_SERVICIO,
    }
  }

  const pert = act.pertenencia_actual
  if (pert) {
    const man = pert.manifold
    const nombre = man
      ? conjuntoDisplayName({
          descripcion: man.descripcion,
          numero_serie: man.numero_serie,
          id: man.id,
        })
      : String(pert.conjunto_id)
    const mismoDestino =
      opts.conjuntoId != null &&
      String(pert.conjunto_id) === String(opts.conjuntoId)
    return {
      activo: act,
      available: false,
      blockReason: 'en_otro_conjunto',
      canTraspaso: !mismoDestino,
      origenConjuntoId: String(pert.conjunto_id),
      origenConjuntoLabel: nombre,
      message: mismoDestino
        ? `El activo ${serieLabel} ya está instalado en este conjunto.`
        : `Este activo ya pertenece al conjunto ${nombre}. Para cambiarlo de conjunto debe realizar un traspaso.`,
    }
  }

  return { activo: act, available: true }
}

/**
 * Busca por la propiedad real `numero_serie`.
 * Si se pasa `catalog`, filtra esa lista; si no, GET /activos.
 */
export async function lookupActivoParaVincular(opts: {
  serie: string
  catalog?: Activo[] | null
  conjuntoId?: string | number | null
  conjuntoSerie?: string | null
  excludeActivoIds?: Array<string | number>
  excludeSeries?: string[]
}): Promise<VincularLookupResult> {
  const query = String(opts.serie || '').trim()
  if (!query) {
    return {
      status: 'error',
      serie: '',
      message: 'Ingresá un número de serie del activo.',
    }
  }

  try {
    let list: Activo[]
    if (opts.catalog != null) {
      list = Array.isArray(opts.catalog) ? opts.catalog : []
    } else {
      const data = await get<Activo[]>('/activos')
      list = Array.isArray(data) ? data : []
    }

    const matched = list.filter((a) =>
      matchNumeroSerieQuery(query, a.numero_serie),
    )

    if (matched.length === 0) {
      return {
        status: 'not_found',
        serie: normalizeSerieKey(query),
        message: `No se encontró un activo con el número de serie ${normalizeSerieKey(query)}.`,
      }
    }

    const qKey = normalizeSerieKey(query)
    matched.sort((a, b) => {
      const aExact = normalizeSerieKey(readNumeroSerie(a)) === qKey ? 0 : 1
      const bExact = normalizeSerieKey(readNumeroSerie(b)) === qKey ? 0 : 1
      if (aExact !== bExact) return aExact - bExact
      return readNumeroSerie(a).localeCompare(readNumeroSerie(b))
    })

    const candidates = matched.map((act) =>
      assessAvailability(act, { ...opts, query }),
    )
    return { status: 'matches', query, candidates }
  } catch (e) {
    return {
      status: 'error',
      serie: normalizeSerieKey(query),
      message: e instanceof Error ? e.message : 'Error al buscar el activo',
    }
  }
}

function disponibilidadLabel(opts: {
  available?: boolean
  availabilityMessage?: string | null
  vinculado?: boolean
  estado?: string | null
}): string {
  const estado = labelEstadoOperativo(opts.estado)
  if (opts.availabilityMessage) return opts.availabilityMessage
  if (opts.vinculado) return `Instalado en conjunto · ${estado}`
  if (opts.available === false) return `No disponible · ${estado}`
  return `Disponible · ${estado}`
}

/** Resumen compacto compartido (lista y modal). */
export function ActivoVinculadoResumen({
  activo,
  onOpenDetalle,
  className,
  availabilityMessage,
  vinculado = false,
}: {
  activo: Activo
  onOpenDetalle?: (activo: Activo) => void
  className?: string
  /** Si está bloqueado, se muestra el motivo. */
  availabilityMessage?: string | null
  /** true cuando ya está en el conjunto (lista de vinculados). */
  vinculado?: boolean
}) {
  const desc = (
    <span className="truncate">{activo.descripcion || 'Sin descripción'}</span>
  )
  const categoria = labelCategoria(
    activo.categoria,
    activo.categoria_nombre,
  )
  const ubicacionPropia = String(activo.ubicacion || '').trim()
  const ubicacionEfectiva = String(activo.ubicacion_efectiva || '').trim()

  return (
    <div className={cn('space-y-1 text-sm text-white', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold tracking-wide">
          {readNumeroSerie(activo) || '—'}
        </span>
        {onOpenDetalle ? (
          <button
            type="button"
            className="inline-flex max-w-full items-center gap-1 text-left text-sky-300 hover:text-sky-200"
            onClick={() => onOpenDetalle(activo)}
          >
            {desc}
            <Info className="size-3.5 shrink-0 opacity-80" aria-hidden />
          </button>
        ) : (
          <span className="inline-flex max-w-full items-center gap-1 text-sky-300">
            {desc}
            <Info className="size-3.5 shrink-0 opacity-80" aria-hidden />
          </span>
        )}
      </div>
      <div className={cn('flex flex-wrap gap-x-3 gap-y-1 text-xs', COORD_TEXT_MUTED)}>
        {categoria && categoria !== '—' ? <span>{categoria}</span> : null}
        {activo.vencimiento ? (
          <span>Vence {formatFechaSoloDia(activo.vencimiento)}</span>
        ) : null}
        <span>
          {disponibilidadLabel({
            availabilityMessage,
            vinculado,
            estado: activo.estado,
          })}
        </span>
      </div>
      {vinculado && (ubicacionPropia || ubicacionEfectiva) ? (
        <div className={cn('text-xs', COORD_TEXT_MUTED)}>
          {ubicacionPropia ? (
            <div>Ubicación propia: {ubicacionPropia}</div>
          ) : null}
          {ubicacionEfectiva ? (
            <div>Ubicación efectiva (conjunto): {ubicacionEfectiva}</div>
          ) : null}
          {ubicacionPropia &&
          ubicacionEfectiva &&
          ubicacionPropia !== ubicacionEfectiva ? (
            <div className="text-amber-300">
              La ubicación propia difiere de la efectiva del conjunto.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type VincularActivoModalProps = {
  open: boolean
  onClose: () => void
  conjunto?: Activo | null
  conjuntoSerie?: string | null
  excludeActivoIds?: Array<string | number>
  excludeSeries?: string[]
  mode: 'immediate' | 'deferred'
  onLinked?: (activo: Activo) => void | Promise<void>
  onNotFound?: (serie: string) => void
  onOpenDetalle?: (activo: Activo) => void
  onTraspasoDone?: () => void | Promise<void>
}

export function VincularActivoModal({
  open,
  onClose,
  conjunto = null,
  conjuntoSerie = null,
  excludeActivoIds,
  excludeSeries,
  mode,
  onLinked,
  onNotFound,
  onOpenDetalle,
  onTraspasoDone,
}: VincularActivoModalProps) {
  if (!open) return null
  return (
    <VincularActivoModalInner
      key={`${mode}-${conjunto?.id ?? 'draft'}`}
      onClose={onClose}
      conjunto={conjunto}
      conjuntoSerie={conjuntoSerie}
      excludeActivoIds={excludeActivoIds}
      excludeSeries={excludeSeries}
      mode={mode}
      onLinked={onLinked}
      onNotFound={onNotFound}
      onOpenDetalle={onOpenDetalle}
      onTraspasoDone={onTraspasoDone}
    />
  )
}

function VincularActivoModalInner({
  onClose,
  conjunto,
  conjuntoSerie,
  excludeActivoIds,
  excludeSeries,
  mode,
  onLinked,
  onNotFound,
  onOpenDetalle,
  onTraspasoDone,
}: Omit<VincularActivoModalProps, 'open'>) {
  const [serie, setSerie] = React.useState('')
  const [catalog, setCatalog] = React.useState<Activo[] | null>(null)
  const catalogRef = React.useRef<Activo[] | null>(null)
  const [catalogLoading, setCatalogLoading] = React.useState(true)
  const [buscando, setBuscando] = React.useState(false)
  const [candidates, setCandidates] = React.useState<VincularCandidate[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [msg, setMsg] = React.useState<{
    kind: 'error' | 'warning'
    title: string
    description: string
  } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [traspasoOpen, setTraspasoOpen] = React.useState(false)
  const savingRef = React.useRef(false)
  const clientUuidRef = React.useRef(newClientUuid())
  const excludeIdsRef = React.useRef(excludeActivoIds)
  const excludeSeriesRef = React.useRef(excludeSeries)
  const searchGenRef = React.useRef(0)

  const handleClose = React.useCallback(() => {
    if (savingRef.current) return
    onClose()
  }, [onClose])

  React.useEffect(() => {
    excludeIdsRef.current = excludeActivoIds
    excludeSeriesRef.current = excludeSeries
  }, [excludeActivoIds, excludeSeries])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCatalogLoading(true)
      try {
        const data = await get<Activo[]>('/activos')
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        catalogRef.current = list
        setCatalog(list)
      } catch (e) {
        if (cancelled) return
        catalogRef.current = []
        setCatalog([])
        setMsg({
          kind: 'error',
          title: 'Error al cargar catálogo',
          description:
            e instanceof Error
              ? e.message
              : 'No se pudo cargar el catálogo de activos.',
        })
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    const query = String(serie || '').trim()
    if (query.length < MIN_QUERY_CHARS || catalog == null) {
      // Invalidar búsquedas en vuelo; el clear de UI se hace en onChange (no setState sync aquí).
      searchGenRef.current += 1
      return
    }

    const gen = ++searchGenRef.current
    const t = window.setTimeout(() => {
      void (async () => {
        if (gen !== searchGenRef.current) return
        setBuscando(true)
        const result = await lookupActivoParaVincular({
          serie: query,
          catalog,
          conjuntoId: conjunto?.id,
          conjuntoSerie: conjuntoSerie || conjunto?.numero_serie,
          excludeActivoIds: excludeIdsRef.current,
          excludeSeries: excludeSeriesRef.current,
        })
        if (gen !== searchGenRef.current) return

        if (result.status === 'matches') {
          const next = result.candidates.slice(0, MAX_SUGGESTIONS)
          setCandidates(next)
          setSelectedId((prev) =>
            prev && next.some((c) => String(c.activo.id) === prev) ? prev : null,
          )
        } else {
          setCandidates([])
          setSelectedId(null)
        }
        setBuscando(false)
      })()
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(t)
    }
  }, [serie, catalog, conjunto?.id, conjunto?.numero_serie, conjuntoSerie])
  const selected = candidates.find((c) => String(c.activo.id) === selectedId)

  async function buscar(serieOverride?: string) {
    const raw = serieOverride !== undefined ? serieOverride : serie
    const query = String(raw || '').trim()
    if (!query) {
      setMsg({
        kind: 'error',
        title: 'Serie requerida',
        description: 'Ingresá un número de serie del activo.',
      })
      setCandidates([])
      setSelectedId(null)
      return
    }

    const gen = ++searchGenRef.current
    setBuscando(true)
    setMsg(null)

    const result = await lookupActivoParaVincular({
      serie: query,
      catalog: catalogRef.current,
      conjuntoId: conjunto?.id,
      conjuntoSerie: conjuntoSerie || conjunto?.numero_serie,
      excludeActivoIds: excludeIdsRef.current,
      excludeSeries: excludeSeriesRef.current,
    })

    if (gen !== searchGenRef.current) return
    setBuscando(false)

    if (result.status === 'matches') {
      const next = result.candidates.slice(0, MAX_SUGGESTIONS)
      setCandidates(next)
      if (next.length === 1) {
        const only = next[0]
        setSelectedId(String(only.activo.id))
        if (!only.available && only.message) {
          setMsg({
            kind: 'warning',
            title: 'No se puede vincular',
            description: only.message,
          })
        }
      } else {
        setSelectedId(null)
      }
      return
    }

    if (result.status === 'not_found') {
      setCandidates([])
      setSelectedId(null)
      setMsg({
        kind: 'warning',
        title: 'Activo no encontrado',
        description: result.message,
      })
      if (mode === 'deferred' && onNotFound) {
        onNotFound(result.serie)
        onClose()
      }
      return
    }

    setCandidates([])
    setSelectedId(null)
    setMsg({
      kind: 'error',
      title: 'Error de búsqueda',
      description: result.message,
    })
  }

  async function confirmar() {
    if (!selected?.available || !selected.activo || savingRef.current || buscando) {
      return
    }
    const candidato = selected.activo

    if (mode === 'deferred') {
      await onLinked?.(candidato)
      onClose()
      return
    }

    if (!conjunto) {
      setMsg({
        kind: 'error',
        title: 'Conjunto requerido',
        description: 'Seleccioná un conjunto antes de vincular.',
      })
      return
    }

    savingRef.current = true
    setSaving(true)
    setMsg(null)
    try {
      await post<PostComponenteResponse>(
        `/activos/${encodeURIComponent(String(conjunto.id))}/componentes`,
        {
          componente_id: candidato.id,
          client_uuid: clientUuidRef.current,
          usuario: usuarioActual(),
        },
      )
      await onLinked?.(candidato)
      onClose()
    } catch (e) {
      let description = e instanceof Error ? e.message : String(e)
      if (e instanceof ApiError) {
        const details = e.details as PostComponenteResponse | undefined
        if (details?.code === 'COMPONENTE_FUERA_DE_SERVICIO') {
          description = MSG_FUERA_DE_SERVICIO
        } else if (details?.code === 'COMPONENTE_EN_OTRO_CONJUNTO') {
          const label =
            details.conjunto_origen_label ||
            details.conjunto_origen?.numero_serie ||
            details.conjunto_id_actual ||
            'otro conjunto'
          description = `Este activo ya pertenece al conjunto ${label}. Para cambiarlo de conjunto debe realizar un traspaso.`
          // Refrescar candidato para ofrecer traspaso.
          setCandidates((prev) =>
            prev.map((c) =>
              String(c.activo.id) === String(candidato.id)
                ? {
                    ...c,
                    available: false,
                    blockReason: 'en_otro_conjunto',
                    canTraspaso: true,
                    origenConjuntoId: String(
                      details.conjunto_id_actual ??
                        c.origenConjuntoId ??
                        '',
                    ),
                    origenConjuntoLabel: String(label),
                    message: description,
                  }
                : c,
            ),
          )
        }
      }
      setMsg({
        kind: 'error',
        title: 'No se pudo vincular',
        description,
      })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const canConfirm = Boolean(selected?.available) && !buscando && !saving
  const canOfferTraspaso =
    mode === 'immediate' &&
    Boolean(conjunto) &&
    selected?.blockReason === 'en_otro_conjunto' &&
    selected.canTraspaso === true

  const inputId = 'vincular-activo-serie'
  const statusHint = catalogLoading
    ? 'Cargando catálogo…'
    : buscando
      ? 'Buscando…'
      : null

  return (
    <>
      <Modal
        open
        onClose={handleClose}
        title={VINCULAR_ACTIVO_TITLE}
        subtitle={
          conjunto
            ? `Conjunto ${conjunto.numero_serie || conjunto.descripcion || ''}`
            : undefined
        }
        compact
        maxWidthClassName="w-[min(640px,calc(100vw-32px))] max-w-none"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={COORD_BTN_SECONDARY}
              disabled={saving}
              onClick={handleClose}
            >
              Cancelar
            </button>
            {canOfferTraspaso ? (
              <button
                type="button"
                className={COORD_BTN_PRIMARY}
                disabled={saving}
                onClick={() => setTraspasoOpen(true)}
              >
                Realizar traspaso
              </button>
            ) : (
              <button
                type="button"
                className={COORD_BTN_PRIMARY}
                disabled={!canConfirm}
                onClick={() => void confirmar()}
              >
                {saving ? 'Vinculando…' : VINCULAR_ACTIVO_CONFIRM}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={COORD_LABEL} htmlFor={inputId}>
              {VINCULAR_ACTIVO_FIELD}
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                id={inputId}
                className={`${COORD_INPUT_LG} min-w-0 flex-1 normal-case`}
                value={serie}
                disabled={saving}
                autoComplete="off"
                spellCheck={false}
                placeholder="Ej. K-M001-001"
                onChange={(e) => {
                  const next = e.target.value
                  setSerie(next)
                  if (String(next).trim().length < MIN_QUERY_CHARS) {
                    setCandidates([])
                    setSelectedId(null)
                    setBuscando(false)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void buscar((e.target as HTMLInputElement).value)
                  }
                }}
              />
              <button
                type="button"
                className={COORD_BTN_SECONDARY}
                disabled={buscando || saving}
                onClick={() => void buscar()}
              >
                {buscando ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            {statusHint ? (
              <p className={cn('mt-1 text-xs', COORD_TEXT_MUTED)}>{statusHint}</p>
            ) : null}
          </div>

          {msg ? (
            <InlineMessage
              kind={msg.kind}
              title={msg.title}
              description={msg.description}
            />
          ) : null}

          {candidates.length > 0 ? (
            <div className="space-y-2">
              <div
                className={cn('text-xs font-semibold uppercase', COORD_TEXT_MUTED)}
              >
                {candidates.length === 1
                  ? 'Resultado'
                  : `${candidates.length} coincidencias por número de serie`}
              </div>
              <ul className="max-h-56 space-y-2 overflow-auto">
                {candidates.map((c) => {
                  const id = String(c.activo.id)
                  const active = selectedId === id
                  const disabledVisual =
                    c.blockReason === 'fuera_de_servicio' || !c.available
                  return (
                    <li key={id}>
                      <div
                        role="option"
                        aria-selected={active}
                        aria-disabled={disabledVisual}
                        tabIndex={0}
                        className={cn(
                          'w-full cursor-pointer rounded-xl border px-3 py-2 text-left transition',
                          active
                            ? 'border-sky-500/60 bg-slate-800/80'
                            : 'border-slate-700 bg-slate-900/50 hover:bg-slate-800/60',
                          disabledVisual && 'opacity-70',
                        )}
                        onClick={() => {
                          setSelectedId(id)
                          if (!c.available && c.message) {
                            setMsg({
                              kind: 'warning',
                              title: 'No se puede vincular',
                              description: c.message,
                            })
                          } else {
                            setMsg(null)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            ;(e.currentTarget as HTMLDivElement).click()
                          }
                        }}
                      >
                        <ActivoVinculadoResumen
                          activo={c.activo}
                          onOpenDetalle={onOpenDetalle}
                          availabilityMessage={
                            c.available
                              ? null
                              : c.message || 'No disponible para vincular'
                          }
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {selected?.available && conjunto ? (
            <p className={cn('text-sm', COORD_TEXT)}>
              Se vinculará{' '}
              <span className="font-semibold">
                {readNumeroSerie(selected.activo) || selected.activo.id}
              </span>{' '}
              al conjunto{' '}
              <span className="font-semibold">
                {conjunto.numero_serie || conjunto.descripcion || conjunto.id}
              </span>
              .
            </p>
          ) : null}

          {canOfferTraspaso && selected ? (
            <InlineMessage
              kind="warning"
              title="Traspaso requerido"
              description={`Origen automático: ${selected.origenConjuntoLabel}. El destino es el conjunto actual.`}
            />
          ) : null}
        </div>
      </Modal>

      {traspasoOpen && selected && conjunto ? (
        <TraspasoActivoModal
          open
          onClose={() => setTraspasoOpen(false)}
          activo={selected.activo}
          origenId={selected.origenConjuntoId || ''}
          origenLabel={selected.origenConjuntoLabel || 'origen'}
          destino={conjunto}
          onDone={async () => {
            setTraspasoOpen(false)
            await onTraspasoDone?.()
            await onLinked?.(selected.activo)
            onClose()
          }}
        />
      ) : null}
    </>
  )
}

function TraspasoActivoModal({
  open,
  onClose,
  activo,
  origenId,
  origenLabel,
  destino,
  onDone,
}: {
  open: boolean
  onClose: () => void
  activo: Activo
  origenId: string
  origenLabel: string
  destino: Activo
  onDone: () => void | Promise<void>
}) {
  const [origenFds, setOrigenFds] = React.useState(false)
  const [confirmStep, setConfirmStep] = React.useState(false)
  const [observaciones, setObservaciones] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const clientUuidRef = React.useRef(newClientUuid())

  if (!open) return null

  const serie = readNumeroSerie(activo) || String(activo.id)
  const destinoLabel = conjuntoDisplayName({
    numero_serie: destino.numero_serie,
    descripcion: destino.descripcion,
    id: destino.id,
  })

  async function ejecutar() {
    setSaving(true)
    setError(null)
    try {
      await post<PostTraspasoResponse>(
        `/activos/${encodeURIComponent(String(destino.id))}/componentes/${encodeURIComponent(String(activo.id))}/traspaso`,
        {
          conjunto_origen_id: origenId,
          origen_fuera_de_servicio: origenFds,
          observaciones: observaciones.trim() || undefined,
          usuario: usuarioActual(),
          client_uuid: clientUuidRef.current,
          origen_operacion: 'web',
        },
      )
      await onDone()
    } catch (e) {
      let description = e instanceof Error ? e.message : String(e)
      if (e instanceof ApiError) {
        const details = e.details as PostTraspasoResponse | undefined
        if (details?.code === 'COMPONENTE_FUERA_DE_SERVICIO') {
          description = MSG_FUERA_DE_SERVICIO
        } else if (details?.error) {
          description = details.error
        }
      }
      setError(description)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose()
      }}
      title="Realizar traspaso"
      subtitle="Operación online atómica"
      compact
      maxWidthClassName="w-[min(640px,calc(100vw-32px))] max-w-none"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={COORD_BTN_SECONDARY}
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          {!confirmStep ? (
            <button
              type="button"
              className={COORD_BTN_PRIMARY}
              onClick={() => setConfirmStep(true)}
            >
              Revisar resumen
            </button>
          ) : (
            <button
              type="button"
              className={COORD_BTN_PRIMARY}
              disabled={saving}
              onClick={() => void ejecutar()}
            >
              {saving ? 'Traspasando…' : 'Confirmar traspaso'}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4 text-sm text-white">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <div className={COORD_TEXT_MUTED}>Activo</div>
            <div className="font-semibold">{serie}</div>
            <div className={COORD_TEXT_MUTED}>
              {activo.descripcion || 'Sin descripción'}
            </div>
          </div>
          <div>
            <div className={COORD_TEXT_MUTED}>Estado actual</div>
            <div className="font-semibold">
              {labelEstadoOperativo(activo.estado)}
            </div>
          </div>
          <div>
            <div className={COORD_TEXT_MUTED}>Conjunto de origen (automático)</div>
            <div className="font-semibold">{origenLabel}</div>
          </div>
          <div>
            <div className={COORD_TEXT_MUTED}>Conjunto de destino</div>
            <div className="font-semibold">{destinoLabel}</div>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className={COORD_LABEL}>
            ¿El conjunto de origen queda fuera de servicio después de retirar
            este activo?
          </legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="origen-fds"
              checked={!origenFds}
              onChange={() => setOrigenFds(false)}
              disabled={saving}
            />
            No: el conjunto de origen conserva su estado actual.
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="origen-fds"
              checked={origenFds}
              onChange={() => setOrigenFds(true)}
              disabled={saving}
            />
            Sí: el conjunto de origen pasa a Fuera de servicio.
          </label>
        </fieldset>

        <div>
          <label className={COORD_LABEL} htmlFor="traspaso-obs">
            Observación (opcional)
          </label>
          <input
            id="traspaso-obs"
            className={`${COORD_INPUT_LG} mt-1 w-full`}
            value={observaciones}
            disabled={saving}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>

        {confirmStep ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <div className="mb-2 font-semibold">Resumen del movimiento</div>
            <ul className={cn('list-disc space-y-1 pl-5', COORD_TEXT)}>
              <li>
                Activo: <strong>{serie}</strong>
              </li>
              <li>
                Sale del conjunto: <strong>{origenLabel}</strong>
              </li>
              <li>
                Ingresa al conjunto: <strong>{destinoLabel}</strong>
              </li>
              <li>
                Estado final del conjunto de origen:{' '}
                <strong>
                  {origenFds
                    ? 'Fuera de servicio'
                    : 'Conserva su estado actual'}
                </strong>
              </li>
            </ul>
          </div>
        ) : null}

        {error ? (
          <InlineMessage kind="error" title="Traspaso no aplicado" description={error} />
        ) : null}
      </div>
    </Modal>
  )
}

export function VincularActivoTrigger({
  onClick,
  disabled,
  className,
}: {
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      className={cn(
        'text-sm font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50',
        className,
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {VINCULAR_ACTIVO_LABEL}
    </button>
  )
}

export function ActivoVinculadoListItem({
  activo,
  onOpenDetalle,
  onRemove,
  disabled,
}: {
  activo: Activo
  onOpenDetalle?: (activo: Activo) => void
  onRemove?: () => void
  disabled?: boolean
}) {
  return (
    <li className="flex flex-wrap items-start gap-2 border-b border-slate-800/80 py-2">
      <div className="min-w-0 flex-1">
        <ActivoVinculadoResumen
          activo={activo}
          onOpenDetalle={onOpenDetalle}
          vinculado
        />
      </div>
      {onRemove ? (
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40"
          disabled={disabled}
          aria-label="Quitar"
          onClick={onRemove}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </li>
  )
}
