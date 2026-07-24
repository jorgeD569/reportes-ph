'use client'

import * as React from 'react'
import { DataField } from '@/components/ui/DataField'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ActivoTipoBadge } from '@/components/coordinador/inventario/ActivoTipoBadge'
import { get } from '@/lib/api'
import {
  COORD_BTN_SECONDARY,
  COORD_LABEL,
  COORD_SECTION_MUTED,
  COORD_SECTION_TITLE,
  COORD_TEXT,
  COORD_TEXT_MUTED,
} from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'
import { formatFechaAR, formatFechaSoloDia } from '@/lib/date'
import { labelCategoria, labelEstadoOperativo } from '@/lib/inventario/labels'
import type {
  Activo,
  ActivoAdjunto,
  ComponenteRelacion,
  GetActivoComposicionResponse,
  GetActivoPertenenciaResponse,
  PertenenciaHistorialItem,
} from '@/lib/types/inventario'

const ADJUNTO_TITULOS: Record<string, string> = {
  foto_general: 'Foto general',
  foto_placa: 'Foto de placa',
  certificado: 'Certificado',
  otro: 'Otro archivo',
}

function tituloAdjunto(tipo: string | null | undefined): string {
  const key = String(tipo || '')
    .trim()
    .toLowerCase()
  return ADJUNTO_TITULOS[key] || 'Archivo'
}

function esPdf(adj: ActivoAdjunto): boolean {
  const mime = String(adj.mime_type || '').toLowerCase()
  const path = String(adj.storage_path || '').toLowerCase()
  return mime.includes('pdf') || path.endsWith('.pdf') || adj.tipo === 'certificado'
}

function display(v: string | null | undefined): string {
  const t = String(v ?? '').trim()
  return t === '' ? '—' : t
}

function fechaDia(v: string | null | undefined): string {
  if (!v) return '—'
  const solo = formatFechaSoloDia(v)
  if (solo && solo !== '—') return solo
  const ar = formatFechaAR(v)
  return ar === '-' ? '—' : ar
}

function idOf(v: string | number | null | undefined): string | null {
  if (v == null || v === '') return null
  return String(v)
}

type Props = {
  open: boolean
  activoId: string | null
  /** Datos del listado (p. ej. pertenencia_actual) mientras carga el detalle. */
  initialActivo?: Activo | null
  onClose: () => void
  /** Cambia el activo mostrado en el mismo modal (evita apilar modales). */
  onSelectActivoId: (id: string) => void
}

export function ActivoDetalleModal({
  open,
  activoId,
  initialActivo = null,
  onClose,
  onSelectActivoId,
}: Props) {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [composicion, setComposicion] =
    React.useState<GetActivoComposicionResponse | null>(null)
  const [pertenencia, setPertenencia] =
    React.useState<GetActivoPertenenciaResponse | null>(null)
  const [histCompOpen, setHistCompOpen] = React.useState(false)
  const [histManOpen, setHistManOpen] = React.useState(false)
  const [lightbox, setLightbox] = React.useState<{ url: string; title: string } | null>(
    null,
  )

  const initialForId =
    initialActivo && activoId && String(initialActivo.id) === String(activoId)
      ? initialActivo
      : null

  React.useEffect(() => {
    if (!open || !activoId) return

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setComposicion(null)
      setPertenencia(null)
      setHistCompOpen(false)
      setHistManOpen(false)
      try {
        const id = encodeURIComponent(activoId!)
        const [comp, pert] = await Promise.all([
          get<GetActivoComposicionResponse>(`/activos/${id}/composicion`),
          get<GetActivoPertenenciaResponse>(`/activos/${id}/pertenencia`),
        ])
        if (cancelled) return
        if (!comp?.ok) throw new Error(comp?.error || 'No se pudo cargar la composición')
        if (!pert?.ok) throw new Error(pert?.error || 'No se pudo cargar la pertenencia')
        setComposicion(comp)
        setPertenencia(pert)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, activoId])

  React.useEffect(() => {
    if (!lightbox) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setLightbox(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [lightbox])

  const activo = composicion?.activo ?? pertenencia?.activo ?? initialForId
  const esConjunto = activo?.es_conjunto === true
  const pertenece =
    pertenencia?.pertenencia_actual != null ||
    (!pertenencia && initialForId?.es_componente === true) ||
    (!pertenencia && initialForId?.pertenencia_actual != null)
  const pertenenciaActual =
    pertenencia?.pertenencia_actual ?? initialForId?.pertenencia_actual ?? null
  const adjuntos = composicion?.adjuntos ?? []
  const componentes = composicion?.componentes_actuales ?? []
  const histComp = composicion?.componentes_historial ?? []
  const histMan = (pertenencia?.historial ?? []).filter(
    (h) => h.fecha_hasta != null,
  ) as PertenenciaHistorialItem[]

  const subtitle = activo
    ? [activo.numero_serie ? `Serie ${activo.numero_serie}` : null, activo.descripcion]
        .filter(Boolean)
        .join(' · ')
    : undefined

  function goToActivo(rawId: string | number | null | undefined) {
    const id = idOf(rawId)
    if (!id || id === String(activoId)) return
    onSelectActivoId(id)
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Detalle del activo"
        subtitle={subtitle}
        compact
        maxWidthClassName="w-[min(960px,calc(100vw-32px))] max-w-none"
        bodyClassName="!p-4 sm:!p-5"
        footer={
          <div className="flex justify-end">
            <button type="button" className={COORD_BTN_SECONDARY} onClick={onClose}>
              Cerrar
            </button>
          </div>
        }
      >
        {loading && !activo ? <LoadingState label="Cargando detalle…" /> : null}
        {error ? (
          <InlineMessage kind="error" title="No se pudo cargar el detalle" description={error} />
        ) : null}

        {!error && activo ? (
          <div className="space-y-6">
            {loading ? (
              <p className={cn('text-sm', COORD_TEXT_MUTED)}>Actualizando detalle…</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <ActivoTipoBadge
                esConjunto={esConjunto}
                esComponente={
                  pertenencia?.pertenencia_actual != null ||
                  activo.es_componente === true
                }
              />
              {activo.estado_revision ? (
                <StatusBadge variant="neutral">
                  Revisión: {String(activo.estado_revision)}
                </StatusBadge>
              ) : null}
            </div>

            <section>
              <div className={cn('mb-3 text-sm font-semibold', COORD_TEXT)}>Datos generales</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DataField label="Descripción" value={display(activo.descripcion)} />
                <DataField label="Número de serie" value={display(activo.numero_serie)} />
                <DataField label="Categoría" value={labelCategoria(activo.categoria)} />
                <DataField label="Estado" value={labelEstadoOperativo(activo.estado)} />
                <DataField label="Marca" value={display(activo.marca)} />
                <DataField label="Ubicación propia" value={display(activo.ubicacion)} />
                <DataField
                  label="Ubicación efectiva"
                  value={display(activo.ubicacion_efectiva ?? activo.ubicacion)}
                />
                <DataField
                  label="Vencimiento"
                  value={
                    formatFechaAR(activo.vencimiento) === '-'
                      ? '—'
                      : formatFechaAR(activo.vencimiento)
                  }
                />
                <div className="sm:col-span-2">
                  <DataField label="Observaciones" value={display(activo.observaciones)} />
                </div>
              </div>
            </section>

            <section>
              <div className={COORD_SECTION_TITLE}>Fotografías / adjuntos</div>
              <div className={COORD_SECTION_MUTED}>Archivos asociados al activo.</div>
              {adjuntos.length === 0 ? (
                <p className={cn('mt-2 text-sm', COORD_TEXT_MUTED)}>Sin adjuntos.</p>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {adjuntos.map((adj) => {
                    const title = tituloAdjunto(adj.tipo)
                    const url = adj.url_firmada || null
                    const pdf = esPdf(adj)
                    return (
                      <div
                        key={`${adj.id}-${url || ''}`}
                        className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/50"
                      >
                        <div className="border-b border-slate-700 px-3 py-2 text-sm font-medium text-slate-200">
                          {title}
                        </div>
                        <div className="flex min-h-[140px] items-center justify-center p-3">
                          {!url ? (
                            <p className="text-center text-sm text-slate-500">Sin URL firmada</p>
                          ) : pdf ? (
                            <a
                              className={COORD_BTN_SECONDARY}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ver archivo
                            </a>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt={title}
                              className="max-h-[160px] max-w-full cursor-zoom-in object-contain"
                              onClick={() => setLightbox({ url, title })}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {esConjunto ? (
              <section className="space-y-3">
                <div>
                  <div className={COORD_SECTION_TITLE}>Componentes actuales</div>
                  <div className={COORD_SECTION_MUTED}>
                    Cantidad total: {componentes.length}
                  </div>
                </div>
                {componentes.length === 0 ? (
                  <EmptyState
                    title="Sin componentes"
                    description="Este manifold aún no tiene componentes asignados."
                  />
                ) : (
                  <div className="space-y-2">
                    {componentes.map((rel) => (
                      <ComponenteCard
                        key={String(rel.id)}
                        rel={rel}
                        onSerialClick={goToActivo}
                      />
                    ))}
                  </div>
                )}

                <details
                  className="rounded-xl border border-slate-700 bg-slate-900/40"
                  open={histCompOpen}
                  onToggle={(e) => setHistCompOpen((e.target as HTMLDetailsElement).open)}
                >
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-white">
                    Historial de componentes retirados ({histComp.length})
                  </summary>
                  <div className="space-y-2 border-t border-slate-700 px-4 py-3">
                    {histComp.length === 0 ? (
                      <p className={cn('text-sm', COORD_TEXT_MUTED)}>Sin historial.</p>
                    ) : (
                      histComp.map((rel) => (
                        <ComponenteCard
                          key={`h-${String(rel.id)}`}
                          rel={rel}
                          retired
                          onSerialClick={goToActivo}
                        />
                      ))
                    )}
                  </div>
                </details>
              </section>
            ) : null}

            {pertenece && pertenenciaActual ? (
              <section className="space-y-3">
                <div className={COORD_SECTION_TITLE}>Pertenece al manifold</div>
                <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-4 sm:grid-cols-2">
                  <div>
                    <div className={COORD_LABEL}>Número de serie</div>
                    <button
                      type="button"
                      className="mt-1 cursor-pointer text-left text-sm font-semibold text-sky-300 underline-offset-2 hover:underline"
                      onClick={() =>
                        goToActivo(
                          pertenenciaActual.manifold?.id ??
                            pertenenciaActual.conjunto_id,
                        )
                      }
                    >
                      {display(pertenenciaActual.manifold?.numero_serie)}
                    </button>
                  </div>
                  <DataField
                    label="Descripción"
                    value={display(pertenenciaActual.manifold?.descripcion)}
                  />
                  <DataField
                    label="Ubicación efectiva"
                    value={display(
                      activo.ubicacion_efectiva ??
                        pertenenciaActual.manifold?.ubicacion,
                    )}
                  />
                  <DataField
                    label="Posición"
                    value={display(pertenenciaActual.posicion)}
                  />
                  <DataField
                    label="Fecha desde"
                    value={fechaDia(pertenenciaActual.fecha_desde)}
                  />
                </div>

                <details
                  className="rounded-xl border border-slate-700 bg-slate-900/40"
                  open={histManOpen}
                  onToggle={(e) => setHistManOpen((e.target as HTMLDetailsElement).open)}
                >
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-white">
                    Historial de manifolds anteriores ({histMan.length})
                  </summary>
                  <div className="space-y-2 border-t border-slate-700 px-4 py-3">
                    {histMan.length === 0 ? (
                      <p className={cn('text-sm', COORD_TEXT_MUTED)}>Sin historial.</p>
                    ) : (
                      histMan.map((h) => (
                        <div
                          key={String(h.relacion_id)}
                          className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-sm"
                        >
                          <button
                            type="button"
                            className="cursor-pointer font-semibold text-sky-300 underline-offset-2 hover:underline"
                            onClick={() => goToActivo(h.manifold?.id ?? h.conjunto_id)}
                          >
                            {display(h.manifold?.numero_serie)}
                          </button>
                          <div className={cn('mt-1', COORD_TEXT_MUTED)}>
                            {display(h.manifold?.descripcion)} · Posición:{' '}
                            {display(h.posicion)} · {fechaDia(h.fecha_desde)} →{' '}
                            {fechaDia(h.fecha_hasta)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </details>
              </section>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {lightbox ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar vista ampliada"
            className="absolute inset-0 bg-black/80"
            onClick={() => setLightbox(null)}
          />
          <div className="relative z-[61] flex max-h-[calc(100vh-32px)] max-w-[min(1100px,calc(100vw-32px))] flex-col">
            <div className="mb-2 flex items-center justify-between gap-3 text-white">
              <div className="truncate text-sm font-medium">{lightbox.title}</div>
              <button
                type="button"
                className="rounded-lg bg-white/10 px-3 py-1 text-lg leading-none hover:bg-white/20"
                onClick={() => setLightbox(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.title}
              className="max-h-[calc(100vh-80px)] max-w-full object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

function ComponenteCard({
  rel,
  retired,
  onSerialClick,
}: {
  rel: ComponenteRelacion
  retired?: boolean
  onSerialClick: (id: string | number | null | undefined) => void
}) {
  const c = rel.componente
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className={COORD_LABEL}>Posición</div>
          <div className="font-medium text-white">{display(rel.posicion)}</div>
        </div>
        {retired ? <StatusBadge variant="neutral">Retirado</StatusBadge> : null}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <div className={COORD_LABEL}>Número de serie</div>
          <button
            type="button"
            className="mt-0.5 cursor-pointer text-left font-semibold text-sky-300 underline-offset-2 hover:underline"
            onClick={() => onSerialClick(c?.id ?? rel.componente_id)}
          >
            {display(c?.numero_serie)}
          </button>
        </div>
        <div>
          <div className={COORD_LABEL}>Descripción</div>
          <div className="mt-0.5 font-medium text-white">{display(c?.descripcion)}</div>
        </div>
        <div>
          <div className={COORD_LABEL}>Categoría</div>
          <div className="mt-0.5 text-white">{labelCategoria(c?.categoria)}</div>
        </div>
        <div>
          <div className={COORD_LABEL}>Estado</div>
          <div className="mt-0.5 text-white">{labelEstadoOperativo(c?.estado)}</div>
        </div>
        <div>
          <div className={COORD_LABEL}>
            {retired ? 'Incorporación / retiro' : 'Fecha de incorporación'}
          </div>
          <div className="mt-0.5 text-white">
            {fechaDia(rel.fecha_desde)}
            {retired ? ` → ${fechaDia(rel.fecha_hasta)}` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}

