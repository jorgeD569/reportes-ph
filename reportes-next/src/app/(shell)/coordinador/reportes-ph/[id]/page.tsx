'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataField } from '@/components/ui/DataField'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { routes } from '@/lib/constants/routes'
import { get, post } from '@/lib/api'
import type { GetReportePhDetalleResponse, Parte } from '@/lib/types/reportes'
import { formatDateDDMMYYYY, formatDateTimeEsAr } from '@/lib/date'
import { reportePhState, reportePhStateLabel } from '@/lib/status'

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Respuesta flexible de POST /generar-reporte (varias formas según backend). */
type PostGenerarReporteBody = {
  ok?: boolean
  url?: string
  pdf_url?: string
  reporte_pdf_url?: string
  reporte_pdf_path?: string
  message?: string
  error?: string
}

function pdfUrlFromGenerarResp(resp: PostGenerarReporteBody): string | null {
  if (typeof resp.url === 'string' && resp.url.trim()) return resp.url.trim()
  if (typeof resp.pdf_url === 'string' && resp.pdf_url.trim()) return resp.pdf_url.trim()
  if (typeof resp.reporte_pdf_url === 'string' && resp.reporte_pdf_url.trim()) {
    return resp.reporte_pdf_url.trim()
  }
  return null
}

function getPdfUrlFromResponseOrParte(
  response: PostGenerarReporteBody | null | undefined,
  parte: Parte | null | undefined
): string | null {
  const fromResp = response ? pdfUrlFromGenerarResp(response) : null
  if (fromResp) return fromResp

  const p = (parte ?? {}) as Record<string, unknown>
  const candidates = [p.reporte_pdf_url, p.pdf_url, p.url]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }

  return null
}

function safeText(v: unknown) {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException) return e.name === 'AbortError'
  if (typeof e !== 'object' || e === null) return false
  if (!('name' in e)) return false
  const name = (e as { name?: unknown }).name
  return name === 'AbortError'
}

async function fileToBase64Pure(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('No se pudo leer el archivo.'))
        return
      }
      resolve(result)
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo.'))
    reader.readAsDataURL(file)
  })

  const parts = dataUrl.split(',')
  if (parts.length < 2) return dataUrl
  return parts[1]
}

export default function CoordinadorReportePhDetallePage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [parte, setParte] = React.useState<Parte | null>(null)

  const [actionError, setActionError] = React.useState<string | null>(null)
  const [actionInfo, setActionInfo] = React.useState<string | null>(null)

  const [selectedBase64, setSelectedBase64] = React.useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)

  const [uploadingWika, setUploadingWika] = React.useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false)
  const [isCheckingPdf, setIsCheckingPdf] = React.useState(false)
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null)
  const pdfPollTokenRef = React.useRef(0)

  async function confirmPdfUrlQuick(parteId: string) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 3000)
    try {
      const resp = await post<PostGenerarReporteBody>(
        '/generar-reporte',
        { parte_id: parteId },
        { signal: controller.signal }
      )
      const url = getPdfUrlFromResponseOrParte(resp, null)
      const path =
        resp && typeof resp.reporte_pdf_path === 'string' && resp.reporte_pdf_path.trim()
          ? resp.reporte_pdf_path.trim()
          : null
      if (url) setPdfUrl(url)
      if (path) {
        setParte((prev) => (prev ? { ...prev, reporte_pdf_path: path } : prev))
      }
    } catch {
      // Si falla (o timeout), no bloqueamos la UX: el usuario puede reintentar con "Verificar PDF".
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  const loadDetalle = React.useCallback(
    async (opts?: { silent?: boolean }): Promise<Parte | null> => {
      if (!id) return null
      const silent = opts?.silent === true
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const data = await get<GetReportePhDetalleResponse>(
          `/reportes-ph/${encodeURIComponent(id)}`
        )
        setParte(data.parte)
        setPdfUrl((prev) => prev || getPdfUrlFromResponseOrParte(null, data.parte))
        return data.parte
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!silent) setError(msg)
        return null
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [id]
  )

  React.useEffect(() => {
    let cancelled = false
    if (!id) return
    ;(async () => {
      if (cancelled) return
      await loadDetalle()
    })()
    return () => {
      cancelled = true
    }
  }, [id, loadDetalle])

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const phState = parte ? reportePhState(parte) : 'pendiente_grafico'
  const wikaOk = !!parte?.wika_image_path
  const pdfOk = !!parte?.reporte_pdf_path

  async function pollPdfStatus(opts?: { attempts?: number; intervalMs?: number }) {
    const attempts = opts?.attempts ?? 8
    const intervalMs = opts?.intervalMs ?? 1500

    if (!id) return

    const token = ++pdfPollTokenRef.current
    setIsCheckingPdf(true)

    for (let intento = 1; intento <= attempts; intento++) {
      if (pdfPollTokenRef.current !== token) return

      if (process.env.NODE_ENV !== 'production') {
        console.log('POLL PDF INTENTO', intento, parte?.reporte_pdf_path)
      }

      const latest = await loadDetalle({ silent: true })
      if (pdfPollTokenRef.current !== token) return

      if (latest?.reporte_pdf_path) {
        // Si tenemos path pero no URL pública, consultamos el mismo endpoint para que devuelva reporte_pdf_url
        // (en el backend legacy, cuando el PDF ya existe, /generar-reporte responde con reporte_pdf_url rápidamente).
        if (!getPdfUrlFromResponseOrParte(null, latest) && latest.id) {
          void confirmPdfUrlQuick(latest.id)
        }
        setActionInfo('PDF listo.')
        setActionError(null)
        setIsCheckingPdf(false)
        return
      }

      if (intento < attempts) await sleepMs(intervalMs)
    }

    if (pdfPollTokenRef.current === token) {
      setIsCheckingPdf(false)
      setActionInfo(null)
      setActionError(
        'No pudimos confirmar el PDF automáticamente. Esperá unos segundos y tocá verificar nuevamente.'
      )
    }
  }

  async function handleSelectFile(file: File | null) {
    setActionError(null)
    setActionInfo(null)
    setPdfUrl(null)

    setSelectedBase64(null)

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)

    if (!file) return

    setPreviewUrl(URL.createObjectURL(file))
    try {
      const base64 = await fileToBase64Pure(file)
      setSelectedBase64(base64)
    } catch (e) {
      setSelectedBase64(null)
      setPreviewUrl(null)
      setActionError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleUploadWika() {
    if (!parte?.id) return
    if (!selectedBase64) return

    try {
      setUploadingWika(true)
      setActionError(null)
      setActionInfo('Subiendo imagen WIKA…')

      await post<{ ok: boolean; path?: string; url?: string }>(
        '/subir-wika',
        {
          parte_id: parte.id,
          image_base64: selectedBase64,
        }
      )

      setActionInfo('WIKA cargada correctamente.')
      await loadDetalle()
    } catch (e) {
      setActionInfo(null)
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadingWika(false)
    }
  }

  async function handleGenerarPdf() {
    if (!parte?.id) return

    setActionError(null)
    setActionInfo('Generando PDF…')
    setPdfUrl(null)

    // El polling NO depende del POST: siempre intentamos confirmar por GET /reportes-ph/:id.
    void pollPdfStatus({ attempts: 8, intervalMs: 1500 })

    if (process.env.NODE_ENV !== 'production') {
      console.log('GENERAR PDF POST INICIADO')
    }

    let genResp: PostGenerarReporteBody | null = null
    let timedOut = false
    const controller = new AbortController()
    const timeoutMs = 8000
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      setIsGeneratingPdf(true)
      genResp = await post<PostGenerarReporteBody>('/generar-reporte', {
        parte_id: parte.id,
      }, { signal: controller.signal })
    } catch (e) {
      const isAbort =
        (e instanceof DOMException && e.name === 'AbortError') || isAbortError(e)

      if (timedOut || isAbort) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('GENERAR PDF TIMEOUT, INICIANDO POLLING')
        }
        setActionError(null)
        setActionInfo(
          'El PDF está terminando de generarse. Verificando estado…'
        )
      } else {
        setActionInfo(null)
        setActionError(e instanceof Error ? e.message : String(e))
      }
      genResp = null
    } finally {
      window.clearTimeout(timeoutId)
      setIsGeneratingPdf(false)
      if (process.env.NODE_ENV !== 'production') {
        console.log('GENERAR PDF POST FINALIZADO')
      }
    }

    const mergeUrl = genResp ? pdfUrlFromGenerarResp(genResp) : null
    const mergePath =
      genResp && typeof genResp.reporte_pdf_path === 'string' && genResp.reporte_pdf_path.trim()
        ? genResp.reporte_pdf_path.trim()
        : null

    const resolvedUrl = getPdfUrlFromResponseOrParte(genResp, null)
    if (resolvedUrl) setPdfUrl(resolvedUrl)
    if (mergePath) {
      setParte((prev) =>
        prev ? { ...prev, reporte_pdf_path: mergePath } : prev
      )
    }

    // Si el backend devolvió URL, igual hacemos un polling corto para confirmar el path.
    if (mergeUrl && !mergePath) {
      void pollPdfStatus({ attempts: 3, intervalMs: 1500 })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detalle reporte PH"
        subtitle="Carga de gráfico WIKA y generación de PDF (UI nueva)."
        right={
          <Link
            href={routes.coordinador.reportesPh}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-2"
          >
            Volver
          </Link>
        }
      />

      {loading ? <LoadingState label="Cargando detalle…" /> : null}
      {error ? (
        <InlineMessage
          kind="error"
          title="No se pudo cargar el detalle del reporte"
          description={error}
        />
      ) : null}

      <div className="grid gap-6 items-start xl:grid-cols-[minmax(0,1.7fr)_420px]">
        <Card>
          <CardHeader>
            <div>
              <div className="text-lg font-semibold">Datos del parte</div>
              <div className="mt-1 text-sm text-muted">
                Datos en vivo desde <code className="font-mono">GET /reportes-ph/:id</code>.
              </div>
            </div>
            <StatusBadge variant="info">ID: {id}</StatusBadge>
          </CardHeader>
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2">
  <DataField label="Número de reporte" value={safeText(parte?.reporte_numero)} />

  <DataField
    label="Fecha"
    value={
      parte?.fecha
        ? formatDateTimeEsAr(parte.fecha)
        : parte?.created_at
        ? formatDateTimeEsAr(parte.created_at)
        : '—'
    }
  />

  <DataField label="Pozo" value={safeText(parte?.pozo)} />
  <DataField label="Cliente" value={safeText(parte?.cliente)} />

  <DataField label="Tipo de prueba" value={safeText(parte?.tipo_prueba)} />
  <DataField label="Elemento a ensayar" value={safeText(parte?.elemento_ensayar)} />

  <DataField label="Presión de ensayo" value={safeText(parte?.presion_ensayo)} />
  <DataField label="Tiempo de ensayo" value={safeText(parte?.tiempo_ensayo)} />

  <DataField label="Resultado" value={safeText(parte?.resultado_ensayo)} />
  <DataField label="Presión estabilizada" value={safeText(parte?.presion_estabilizada)} />

  <DataField label="Hs estabilizada" value={safeText(parte?.hs_estabilizada)} />
  <DataField label="Presión final" value={safeText(parte?.presion_final)} />

  <DataField label="Hs final" value={safeText(parte?.hs_final)} />
  <DataField label="Caída de presión" value={safeText(parte?.caida_presion)} />

  <DataField label="% de caída" value={safeText(parte?.porcentaje_caida)} />
  <DataField label="Operador líder" value={safeText(parte?.operador_lider)} />

  <DataField label="Supervisor" value={safeText(parte?.supervisor_operativo)} />
  <DataField label="Empresa" value={safeText(parte?.empresa)} />

  <DataField label="Equipo" value={safeText(parte?.equipo)} />

  <DataField
    label="Observaciones"
    value={safeText(parte?.observaciones)}
    className="sm:col-span-2"
  />

  <DataField
    label="Estado"
    value={
      <StatusBadge
        variant={
          phState === 'pdf_generado'
            ? 'success'
            : phState === 'con_grafico'
            ? 'info'
            : 'warning'
        }
      >
        {reportePhStateLabel(phState)}
      </StatusBadge>
    }
  />

  <DataField
    label="Creado"
    value={parte?.created_at ? formatDateTimeEsAr(parte.created_at) : '—'}
  />

  <DataField
    label="WIKA path"
    value={safeText(parte?.wika_image_path)}
    className="sm:col-span-2"
  />

  <DataField
    label="PDF path"
    value={safeText(parte?.reporte_pdf_path)}
    className="sm:col-span-2"
  />
</div>
          </CardBody>
        </Card>

        <Card className="sticky top-6 self-start">
          <CardHeader>
            <div>
              <div className="text-lg font-semibold">WIKA + PDF</div>
              <div className="mt-1 text-sm text-muted">
                Subida WIKA y generación PDF (vía backend actual).
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              {actionInfo ? (
                <InlineMessage kind="info" title={actionInfo} />
              ) : null}
              {actionError ? (
                <InlineMessage kind="error" title="Error" description={actionError} />
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-surface-2 p-4">
                  <div className="text-sm font-semibold">Estado WIKA</div>
                  <div className="mt-2">
                    {wikaOk ? (
                      <StatusBadge variant="success">WIKA cargada</StatusBadge>
                    ) : (
                      <StatusBadge variant="warning">Sin WIKA</StatusBadge>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface-2 p-4">
                  <div className="text-sm font-semibold">Estado PDF</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {pdfOk ? (
                      <StatusBadge variant="success">PDF generado</StatusBadge>
                    ) : (
                      <StatusBadge variant="warning">No generado</StatusBadge>
                    )}
                    {pdfUrl ? (
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold hover:bg-surface-2"
                      >
                        Abrir PDF
                      </a>
                    ) : null}
                    <button
                      type="button"
                      disabled={loading || !!error || !parte?.id || isGeneratingPdf || isCheckingPdf}
                      onClick={() => {
                        setActionError(null)
                        setActionInfo('Verificando PDF…')
                        void pollPdfStatus({ attempts: 8, intervalMs: 1500 })
                      }}
                      className="inline-flex h-8 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold hover:bg-surface-2 disabled:opacity-60"
                    >
                      Verificar PDF
                    </button>
                  </div>
                  {pdfOk && !pdfUrl ? (
                    <div className="mt-2 text-xs text-muted">
                      El link se mostrará cuando el backend devuelva <code className="font-mono">url</code> o{' '}
                      <code className="font-mono">reporte_pdf_url</code>.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-2 p-4">
                <div className="text-sm font-semibold">Seleccionar imagen WIKA</div>
                <input
                  type="file"
                  accept="image/*"
                  className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  disabled={uploadingWika || isGeneratingPdf || loading || !!error}
                  onChange={(e) => handleSelectFile(e.target.files?.[0] ?? null)}
                />

                {previewUrl ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Vista previa WIKA"
                      className="h-[260px] w-full object-contain"
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={
                    uploadingWika ||
                    isGeneratingPdf ||
                    loading ||
                    !!error ||
                    !parte?.id ||
                    !selectedBase64
                  }
                  onClick={handleUploadWika}
                  className="h-11 rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {uploadingWika ? 'Subiendo…' : 'Subir WIKA'}
                </button>
                <button
                  type="button"
                  disabled={
                    uploadingWika ||
                    isGeneratingPdf ||
                    isCheckingPdf ||
                    loading ||
                    !!error ||
                    !parte?.id ||
                    !wikaOk
                  }
                  onClick={handleGenerarPdf}
                  className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isGeneratingPdf
                    ? 'Generando…'
                    : isCheckingPdf
                    ? 'Verificando PDF…'
                    : pdfOk
                    ? 'Obtener PDF'
                    : 'Generar PDF'}
                </button>
              </div>

              <EmptyState
                title="Reglas"
                description="Los POST se realizan por src/lib/api.ts, sin tocar backend ni cambiar payloads. Guardar parte / inventario siguen deshabilitados."
              />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

