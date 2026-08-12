'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { get, post } from '@/lib/api'
import { readAppUsuario } from '@/lib/auth'
import {
  COORD_BTN_PRIMARY,
  COORD_BTN_SECONDARY,
  COORD_INPUT_LG,
  COORD_LABEL,
  COORD_SECTION_MUTED,
  COORD_SECTION_TITLE,
} from '@/lib/coordinador/theme'
import { formatFechaAR } from '@/lib/date'
import { displayCodigoInterno } from '@/lib/inventario/conjuntoDisplay'
import type {
  Activo,
  ActivoAdjunto,
  GetActivoAdjuntosResponse,
  GetActivosPendientesResponse,
} from '@/lib/types/inventario'
import { CategoriaSelect } from '@/components/inventario/CategoriaSelect'
import { labelCategoria } from '@/lib/inventario/labels'

type EditForm = {
  descripcion: string
  categoria_id: string
  categoria: string
  numero_serie: string
  marca: string
  estado: string
  ubicacion: string
  asignado_a: string
  vencimiento: string
  codigo_interno: string
  observaciones: string
  /** false = individual, true = conjunto */
  es_conjunto: boolean
  /** ID del conjunto al que pertenece (activo_componentes). */
  conjunto_id: string
}

/** Valores exactos del CHECK de activos.estado (no confundir con estado_revision). */
const ESTADOS_OPERATIVOS_DB = [
  'operativo',
  'fuera de servicio',
  'en reparacion',
  'vencido',
  'baja',
] as const

const ESTADO_OPERATIVO_LABELS: Record<string, string> = {
  operativo: 'Operativo',
  'fuera de servicio': 'Fuera de servicio',
  'en reparacion': 'En reparación',
  vencido: 'Vencido',
  baja: 'Baja',
}

const ADJUNTO_TITULOS: Record<string, string> = {
  foto_general: 'Foto general',
  foto_placa: 'Foto de placa',
  certificado: 'Certificado',
  otro: 'Otro archivo',
}

function normalizeEstadoOperativoUi(raw: string | null | undefined): string {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
  if ((ESTADOS_OPERATIVOS_DB as readonly string[]).includes(s)) return s
  return 'operativo'
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

function toEditForm(a: Activo): EditForm {
  return {
    descripcion: a.descripcion ?? '',
    categoria_id: a.categoria_id ?? '',
    categoria: a.categoria_nombre || a.categoria || '',
    numero_serie: a.numero_serie ?? '',
    marca: a.marca ?? '',
    estado: normalizeEstadoOperativoUi(a.estado),
    ubicacion: a.ubicacion ?? '',
    asignado_a: a.asignado_a ?? '',
    vencimiento: a.vencimiento ? String(a.vencimiento).slice(0, 10) : '',
    codigo_interno: a.codigo_interno ?? '',
    observaciones: a.observaciones ?? '',
    es_conjunto: a.es_conjunto === true,
    conjunto_id: a.pertenencia_actual?.conjunto_id
      ? String(a.pertenencia_actual.conjunto_id)
      : '',
  }
}

function usuarioActual(): string {
  const u = readAppUsuario()
  return u?.nombre?.trim() || u?.usuario?.trim() || 'Coordinador'
}

function formatUsuarioRelevo(id: string | null | undefined): string {
  if (!id) return '—'
  const s = String(id)
  return s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s
}

function AdjuntoCard({
  adj,
  onOpenLightbox,
}: {
  adj: ActivoAdjunto
  onOpenLightbox: (url: string, title: string) => void
}) {
  const title = tituloAdjunto(adj.tipo)
  const viewUrl = adj.url_firmada || null
  const pdf = esPdf(adj)
  const initialStatus: 'loading' | 'ok' | 'error' = !viewUrl
    ? 'error'
    : pdf
      ? 'ok'
      : 'loading'
  const [status, setStatus] = React.useState<'loading' | 'ok' | 'error'>(initialStatus)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900/50">
      <div className="border-b border-slate-700 px-3 py-2 text-sm font-medium text-slate-200">
        {title}
      </div>
      <div className="flex min-h-[220px] flex-1 items-center justify-center p-3">
        {!viewUrl ? (
          <p className="text-center text-sm text-slate-500">
            Sin URL firmada. Puede haber expirado; cerrá y volvé a abrir el detalle.
          </p>
        ) : pdf ? (
          <a
            className={COORD_BTN_SECONDARY}
            href={viewUrl}
            target="_blank"
            rel="noreferrer"
          >
            Ver certificado
          </a>
        ) : (
          <div className="relative flex h-[240px] w-full items-center justify-center">
            {status === 'loading' ? (
              <span className="text-sm text-slate-400">Cargando imagen…</span>
            ) : null}
            {status === 'error' ? (
              <p className="text-center text-sm text-rose-300">
                No se pudo cargar la imagen. La URL firmada puede haber vencido.
              </p>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={viewUrl}
              src={viewUrl}
              alt={title}
              className={`max-h-[240px] max-w-full cursor-zoom-in object-contain ${
                status === 'ok' ? 'block' : 'hidden'
              }`}
              onLoad={() => setStatus('ok')}
              onError={() => setStatus('error')}
              onClick={() => {
                if (status === 'ok') onOpenLightbox(viewUrl, title)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function RelevamientosPendientesClient() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const activoQuery = params.get('activo')

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [activos, setActivos] = React.useState<Activo[]>([])
  const [manualSelected, setManualSelected] = React.useState<Activo | null>(null)
  const [adjuntos, setAdjuntos] = React.useState<ActivoAdjunto[]>([])
  const [adjuntosLoading, setAdjuntosLoading] = React.useState(false)
  const [editForm, setEditForm] = React.useState<EditForm | null>(null)
  const [busy, setBusy] = React.useState(false)
  const busyRef = React.useRef(false)
  const adjuntosLoadedForRef = React.useRef<string | null>(null)
  const [actionMsg, setActionMsg] = React.useState<string | null>(null)
  const [actionErr, setActionErr] = React.useState<string | null>(null)
  const [lightbox, setLightbox] = React.useState<{ url: string; title: string } | null>(
    null,
  )
  const [confirmAprobarOpen, setConfirmAprobarOpen] = React.useState(false)
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [rejectMotivo, setRejectMotivo] = React.useState('')
  const [rejectErr, setRejectErr] = React.useState<string | null>(null)

  const selectedFromQuery = React.useMemo(() => {
    if (!activoQuery || loading) return null
    return activos.find((a) => String(a.id) === String(activoQuery)) ?? null
  }, [activoQuery, activos, loading])

  const selected = manualSelected ?? selectedFromQuery

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await get<GetActivosPendientesResponse>('/activos-pendientes')
      setActivos(Array.isArray(data.activos) ? data.activos : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setActivos([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of pendientes
    void load()
  }, [load])

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

  React.useEffect(() => {
    if (!selected) {
      adjuntosLoadedForRef.current = null
      return
    }
    const id = String(selected.id)
    if (adjuntosLoadedForRef.current === id) return
    adjuntosLoadedForRef.current = id

    let cancelled = false
    setEditForm(toEditForm(selected))
    setActionMsg(null)
    setActionErr(null)
    setAdjuntos([])
    setAdjuntosLoading(true)
    void get<GetActivoAdjuntosResponse>(
      `/activos/${encodeURIComponent(selected.id)}/adjuntos`,
    )
      .then((data) => {
        if (cancelled) return
        setAdjuntos(Array.isArray(data.adjuntos) ? data.adjuntos : [])
      })
      .catch(() => {
        if (cancelled) return
        setAdjuntos([])
      })
      .finally(() => {
        if (!cancelled) setAdjuntosLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selected])

  function openDetalle(a: Activo) {
    adjuntosLoadedForRef.current = null
    setManualSelected(a)
  }

  function closeDetalle() {
    if (busyRef.current) return
    setManualSelected(null)
    setLightbox(null)
    adjuntosLoadedForRef.current = null
    if (activoQuery) {
      const next = new URLSearchParams(params.toString())
      next.delete('activo')
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }
  }

  async function ejecutarAprobar() {
    if (!selected || !editForm || busyRef.current) {
      throw new Error('No hay relevamiento seleccionado.')
    }
    busyRef.current = true
    setBusy(true)
    setActionErr(null)
    setActionMsg(null)
    try {
      const data = await post<{ ok: boolean; activo?: Activo; error?: string }>(
        `/activos/${encodeURIComponent(selected.id)}/aprobar`,
        {
          usuario: usuarioActual(),
          patch: {
            descripcion: editForm.descripcion.trim(),
            categoria_id: editForm.categoria_id.trim() || undefined,
            numero_serie: editForm.numero_serie.trim(),
            marca: editForm.marca.trim() || null,
            estado: normalizeEstadoOperativoUi(editForm.estado),
            ubicacion: editForm.es_conjunto
              ? editForm.ubicacion.trim() || null
              : editForm.conjunto_id
                ? null
                : editForm.ubicacion.trim() || null,
            asignado_a: editForm.asignado_a.trim() || null,
            vencimiento: editForm.vencimiento.trim() || null,
            codigo_interno: editForm.codigo_interno.trim() || null,
            observaciones: editForm.observaciones.trim() || null,
            es_conjunto: editForm.es_conjunto === true,
            conjunto_id: editForm.es_conjunto
              ? null
              : editForm.conjunto_id.trim() || null,
          },
        },
      )
      if (!data?.ok) throw new Error(data?.error || 'No se pudo aprobar')

      setActionMsg('Relevamiento aprobado. Ya figura en el inventario operativo.')
      setConfirmAprobarOpen(false)
      setManualSelected(null)
      adjuntosLoadedForRef.current = null
      if (activoQuery) {
        const next = new URLSearchParams(params.toString())
        next.delete('activo')
        const qs = next.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      }
      await load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setActionErr(msg)
      throw e instanceof Error ? e : new Error(msg)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function ejecutarRechazar() {
    if (!selected || busyRef.current) {
      throw new Error('No hay relevamiento seleccionado.')
    }
    const motivo = rejectMotivo.trim()
    if (!motivo) {
      throw new Error('El motivo del rechazo es obligatorio.')
    }
    busyRef.current = true
    setBusy(true)
    setActionErr(null)
    setActionMsg(null)
    setRejectErr(null)
    try {
      const data = await post<{ ok: boolean; error?: string }>(
        `/activos/${encodeURIComponent(selected.id)}/rechazar`,
        { usuario: usuarioActual(), motivo },
      )
      if (!data?.ok) throw new Error(data?.error || 'No se pudo rechazar')
      setActionMsg('Relevamiento rechazado. Ya no aparece en pendientes.')
      setRejectOpen(false)
      setRejectMotivo('')
      setManualSelected(null)
      adjuntosLoadedForRef.current = null
      if (activoQuery) {
        const next = new URLSearchParams(params.toString())
        next.delete('activo')
        const qs = next.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      }
      await load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setRejectErr(msg)
      setActionErr(msg)
      throw e instanceof Error ? e : new Error(msg)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const headerSubtitle = selected
    ? [
        selected.numero_serie ? `Serie ${selected.numero_serie}` : null,
        selected.descripcion?.trim() || null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relevamientos pendientes"
        subtitle="Revisión de activos cargados desde la app de campo. No incluye activos inactivos históricos."
      />

      {actionMsg ? <InlineMessage kind="success" title="Listo" description={actionMsg} /> : null}
      {actionErr && !selected ? (
        <InlineMessage kind="error" title="Error" description={actionErr} />
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <div className={COORD_SECTION_TITLE}>Cola de revisión</div>
            <div className={COORD_SECTION_MUTED}>
              Solo pendientes de revisión. Aprobar habilita el activo en inventario.
              Rechazar lo saca de esta cola sin eliminarlo.
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-4 pt-0">
          {loading ? <LoadingState label="Cargando relevamientos…" /> : null}
          {error ? (
            <InlineMessage kind="error" title="No se pudieron cargar" description={error} />
          ) : null}
          {!loading && !error && activos.length === 0 ? (
            <EmptyState
              title="Sin relevamientos pendientes"
              description="Cuando un operador sincronice un activo desde la app, aparecerá aquí."
            />
          ) : null}
          <ul className="divide-y divide-slate-800">
            {activos.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white">
                    {a.descripcion || 'Sin descripción'}
                  </div>
                  <div className="text-sm text-slate-400">
                    Serie: {a.numero_serie || '—'} ·{' '}
                    {labelCategoria(a.categoria_nombre || a.categoria)} ·{' '}
                    {ESTADO_OPERATIVO_LABELS[normalizeEstadoOperativoUi(a.estado)] ||
                      '—'}
                    {' · '}
                    {formatFechaAR(a.vencimiento) !== '-'
                      ? `Vence ${formatFechaAR(a.vencimiento)}`
                      : 'Sin vencimiento'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge variant="warning">Pendiente</StatusBadge>
                  <button
                    type="button"
                    className={COORD_BTN_SECONDARY}
                    onClick={() => void openDetalle(a)}
                  >
                    Revisar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Modal
        open={!!selected}
        onClose={closeDetalle}
        title="Relevamiento pendiente"
        subtitle={headerSubtitle}
        compact
        maxWidthClassName="w-[min(1000px,calc(100vw-32px))] max-w-none"
        bodyClassName="!p-4 sm:!p-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className={COORD_BTN_SECONDARY}
              disabled={busy}
              onClick={() => {
                setRejectErr(null)
                setRejectMotivo('')
                setRejectOpen(true)
              }}
            >
              Rechazar
            </button>
            <button
              type="button"
              className={COORD_BTN_PRIMARY}
              disabled={busy}
              onClick={() => setConfirmAprobarOpen(true)}
            >
              {editForm?.es_conjunto
                ? 'Aprobar conjunto'
                : 'Aprobar relevamiento'}
            </button>
          </div>
        }
      >
        {selected && editForm ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {actionErr ? (
              <div className="md:col-span-2">
                <InlineMessage kind="error" title="Error" description={actionErr} />
              </div>
            ) : null}

            {/* Columna izquierda */}
            <label className={COORD_LABEL}>
              Descripción
              <input
                className={`${COORD_INPUT_LG} mt-1 normal-case`}
                value={editForm.descripcion}
                disabled={busy}
                onChange={(e) =>
                  setEditForm((f) =>
                    f ? { ...f, descripcion: e.target.value } : f,
                  )
                }
              />
            </label>

            {/* Columna derecha fila 1 */}
            <label className={COORD_LABEL}>
              Ubicación
              <input
                className={`${COORD_INPUT_LG} mt-1 normal-case`}
                value={editForm.ubicacion}
                disabled={busy}
                onChange={(e) =>
                  setEditForm((f) =>
                    f ? { ...f, ubicacion: e.target.value } : f,
                  )
                }
              />
            </label>

            <label className={COORD_LABEL}>
              Número de serie
              <input
                className={`${COORD_INPUT_LG} mt-1 normal-case`}
                value={editForm.numero_serie}
                disabled={busy}
                onChange={(e) =>
                  setEditForm((f) =>
                    f ? { ...f, numero_serie: e.target.value } : f,
                  )
                }
              />
            </label>

            <label className={COORD_LABEL}>
              Asignado a
              <input
                className={`${COORD_INPUT_LG} mt-1 normal-case`}
                value={editForm.asignado_a}
                disabled={busy}
                onChange={(e) =>
                  setEditForm((f) =>
                    f ? { ...f, asignado_a: e.target.value } : f,
                  )
                }
              />
            </label>

            <label className={COORD_LABEL}>
              Tipo de activo
              <select
                className={`${COORD_INPUT_LG} mt-1 normal-case`}
                value={editForm.es_conjunto ? 'manifold' : 'individual'}
                disabled={busy}
                aria-label="Tipo de activo"
                onChange={(e) =>
                  setEditForm((f) =>
                    f
                      ? { ...f, es_conjunto: e.target.value === 'manifold' }
                      : f,
                  )
                }
              >
                <option value="individual">Activo individual</option>
                <option value="manifold">Conjunto</option>
              </select>
              <span className="mt-1 block text-xs font-normal normal-case text-slate-400">
                Un conjunto puede aprobarse sin componentes; se arman después en
                Inventario → Conjuntos.
              </span>
            </label>

            <label className={COORD_LABEL}>
              Categoría
              <div className="mt-1">
                <CategoriaSelect
                  className={`${COORD_INPUT_LG} normal-case`}
                  value={editForm.categoria_id}
                  includeInactiveId={editForm.categoria_id || null}
                  aplicable={
                    editForm.es_conjunto ? 'conjuntos' : 'activos'
                  }
                  disabled={busy}
                  onChange={(id, cat) =>
                    setEditForm((f) =>
                      f
                        ? {
                            ...f,
                            categoria_id: id,
                            categoria: cat?.nombre || '',
                          }
                        : f,
                    )
                  }
                />
              </div>
            </label>

            {!editForm.es_conjunto ? (
              <label className={COORD_LABEL}>
                Conjunto (ID remoto, opcional)
                <input
                  className={`${COORD_INPUT_LG} mt-1 normal-case`}
                  value={editForm.conjunto_id}
                  disabled={busy}
                  placeholder="ID del conjunto existente"
                  onChange={(e) =>
                    setEditForm((f) =>
                      f ? { ...f, conjunto_id: e.target.value } : f,
                    )
                  }
                />
                <span className="mt-1 block text-xs font-normal normal-case text-slate-400">
                  Relación por ID real (activo_componentes). Vacío = independiente.
                  Si pertenece a un conjunto, la ubicación propia no se usa.
                </span>
              </label>
            ) : null}

            <label className={COORD_LABEL}>
              Vencimiento
              <div className="mb-1 mt-1 text-base font-medium normal-case text-slate-100">
                {editForm.vencimiento
                  ? formatFechaAR(editForm.vencimiento)
                  : 'Sin vencimiento'}
              </div>
              <input
                type="date"
                className={`${COORD_INPUT_LG} normal-case`}
                value={editForm.vencimiento}
                disabled={busy}
                aria-label="Editar vencimiento"
                onChange={(e) =>
                  setEditForm((f) =>
                    f ? { ...f, vencimiento: e.target.value } : f,
                  )
                }
              />
            </label>

            <label className={COORD_LABEL}>
              Estado operativo
              <select
                className={`${COORD_INPUT_LG} mt-1 normal-case`}
                value={editForm.estado}
                disabled={busy}
                onChange={(e) =>
                  setEditForm((f) =>
                    f
                      ? {
                          ...f,
                          estado: normalizeEstadoOperativoUi(e.target.value),
                        }
                      : f,
                  )
                }
              >
                {ESTADOS_OPERATIVOS_DB.map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_OPERATIVO_LABELS[e]}
                  </option>
                ))}
              </select>
            </label>

            <label className={COORD_LABEL}>
              Código interno
              <input
                className={`${COORD_INPUT_LG} mt-1 normal-case`}
                value={editForm.codigo_interno}
                disabled={busy}
                onChange={(e) =>
                  setEditForm((f) =>
                    f ? { ...f, codigo_interno: e.target.value } : f,
                  )
                }
              />
            </label>

            <label className={COORD_LABEL}>
              Marca
              <input
                className={`${COORD_INPUT_LG} mt-1 normal-case`}
                value={editForm.marca}
                disabled={busy}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, marca: e.target.value } : f))
                }
              />
            </label>

            <div>
              <div className={COORD_LABEL}>Usuario que relevó</div>
              <div className="mt-1 rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2.5 text-sm normal-case text-slate-300">
                {formatUsuarioRelevo(selected.creado_por_user_id)}
              </div>
            </div>

            <label className={`${COORD_LABEL} md:col-span-2`}>
              Observaciones
              <textarea
                className={`${COORD_INPUT_LG} mt-1 min-h-[96px] normal-case`}
                rows={3}
                value={editForm.observaciones}
                disabled={busy}
                onChange={(e) =>
                  setEditForm((f) =>
                    f ? { ...f, observaciones: e.target.value } : f,
                  )
                }
              />
            </label>

            <div className="md:col-span-2">
              <div className={COORD_SECTION_TITLE}>Fotografías y certificado</div>
              {adjuntosLoading ? (
                <p className="mt-2 text-sm text-slate-400">Cargando adjuntos…</p>
              ) : adjuntos.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">
                  Sin adjuntos sincronizados.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {adjuntos.map((adj) => (
                    <AdjuntoCard
                      key={`${adj.id}-${adj.url_firmada || ''}`}
                      adj={adj}
                      onOpenLightbox={(url, title) =>
                        setLightbox({ url, title })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
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

      <ConfirmDialog
        open={confirmAprobarOpen && !!selected && !!editForm}
        title={
          editForm?.es_conjunto
            ? 'Aprobar conjunto'
            : 'Aprobar relevamiento'
        }
        description={
          editForm?.es_conjunto
            ? 'Se habilitará este conjunto en el inventario operativo. Los adjuntos quedan vinculados al mismo registro.'
            : 'Se habilitará este relevamiento en el inventario operativo.'
        }
        confirmLabel={
          editForm?.es_conjunto ? 'Aprobar conjunto' : 'Aprobar relevamiento'
        }
        onCancel={() => {
          if (!busy) setConfirmAprobarOpen(false)
        }}
        onConfirm={ejecutarAprobar}
      >
        {selected && editForm ? (
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
            <div className="font-semibold">
              {editForm.descripcion.trim() || 'Sin descripción'}
            </div>
            <div className="mt-1 text-slate-400">
              Código interno: {displayCodigoInterno(editForm.codigo_interno)}
            </div>
            <div className="text-slate-400">
              Serie: {editForm.numero_serie.trim() || '—'}
            </div>
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={rejectOpen && !!selected}
        title="Rechazar relevamiento"
        description="El activo no se eliminará; solo saldrá de la cola de pendientes."
        confirmLabel="Confirmar rechazo"
        destructive
        error={rejectErr}
        onCancel={() => {
          if (!busy) {
            setRejectOpen(false)
            setRejectMotivo('')
            setRejectErr(null)
          }
        }}
        onConfirm={ejecutarRechazar}
      >
        {selected ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
              <div className="font-semibold">
                {editForm?.descripcion.trim() ||
                  selected.descripcion ||
                  'Sin descripción'}
              </div>
              <div className="mt-1 text-slate-400">
                Código interno:{' '}
                {displayCodigoInterno(
                  editForm?.codigo_interno ?? selected.codigo_interno,
                )}
              </div>
            </div>
            <label className={COORD_LABEL}>
              Motivo del rechazo *
              <textarea
                className={`${COORD_INPUT_LG} mt-1 min-h-[88px] normal-case`}
                rows={3}
                value={rejectMotivo}
                disabled={busy}
                onChange={(e) => setRejectMotivo(e.target.value)}
              />
            </label>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}
