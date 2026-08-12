'use client'

import * as React from 'react'
import {
  COORD_BTN_SECONDARY,
  COORD_SECTION_MUTED,
  COORD_SECTION_TITLE,
  COORD_TEXT_MUTED,
} from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'
import {
  esAdjuntoImagen,
  esAdjuntoPdf,
  nombreArchivoAdjunto,
  tituloAdjunto,
} from '@/lib/inventario/conjuntoDisplay'
import type { ActivoAdjunto } from '@/lib/types/inventario'

type Lightbox = { url: string; title: string }

/**
 * Galería de fotos + documentos de un activo/conjunto.
 * Usa únicamente `url_firmada` (nunca rutas internas de storage).
 */
export function ActivoAdjuntosGallery({
  adjuntos,
  sectionTitle = 'Fotos y documentos',
  emptyLabel = 'Sin fotos ni documentos adjuntos',
}: {
  adjuntos: ActivoAdjunto[]
  sectionTitle?: string
  emptyLabel?: string
}) {
  const [lightbox, setLightbox] = React.useState<Lightbox | null>(null)
  const [imgErrorIds, setImgErrorIds] = React.useState<Record<string, boolean>>(
    {},
  )

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

  const fotos = adjuntos.filter((a) => esAdjuntoImagen(a))
  const docs = adjuntos.filter((a) => !esAdjuntoImagen(a))

  return (
    <>
      <section className="space-y-3">
        <div>
          <div className={COORD_SECTION_TITLE}>{sectionTitle}</div>
          <div className={COORD_SECTION_MUTED}>
            Archivos asociados al registro (URLs firmadas).
          </div>
        </div>

        {adjuntos.length === 0 ? (
          <p className={cn('text-sm', COORD_TEXT_MUTED)}>{emptyLabel}</p>
        ) : (
          <div className="space-y-4">
            {fotos.length > 0 ? (
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-200">
                  Fotografías
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {fotos.map((adj) => {
                    const title = tituloAdjunto(adj.tipo)
                    const url = adj.url_firmada || null
                    const key = String(adj.id)
                    return (
                      <div
                        key={key}
                        className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/50"
                      >
                        <div className="border-b border-slate-700 px-3 py-2 text-sm font-medium text-slate-200">
                          {title}
                        </div>
                        <div className="flex min-h-[140px] items-center justify-center p-3">
                          {!url ? (
                            <p className="text-center text-sm text-slate-500">
                              Sin URL firmada
                            </p>
                          ) : imgErrorIds[key] ? (
                            <p className="text-center text-sm text-rose-300">
                              No se pudo cargar la imagen
                            </p>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt={title}
                              className="max-h-[160px] max-w-full cursor-zoom-in object-contain"
                              onClick={() => setLightbox({ url, title })}
                              onError={() =>
                                setImgErrorIds((m) => ({ ...m, [key]: true }))
                              }
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {docs.length > 0 ? (
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-200">
                  Certificados y documentos
                </div>
                <ul className="space-y-2">
                  {docs.map((adj) => {
                    const title = tituloAdjunto(adj.tipo)
                    const url = adj.url_firmada || null
                    const name = nombreArchivoAdjunto(adj)
                    const pdf = esAdjuntoPdf(adj)
                    return (
                      <li
                        key={String(adj.id)}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-100">
                            {title}
                          </div>
                          <div className="truncate text-xs text-slate-400">
                            {name}
                            {pdf ? ' · PDF' : adj.mime_type ? ` · ${adj.mime_type}` : ''}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {url ? (
                            <>
                              <a
                                className={COORD_BTN_SECONDARY}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Ver
                              </a>
                              <a
                                className={COORD_BTN_SECONDARY}
                                href={url}
                                download={name}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Descargar
                              </a>
                            </>
                          ) : (
                            <span className="text-sm text-slate-500">
                              Sin URL firmada
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

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
