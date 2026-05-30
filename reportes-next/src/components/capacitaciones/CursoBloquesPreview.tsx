'use client'

import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { BLOQUE_TIPO_LABELS, normalizeBloquesOrden } from '@/lib/capacitaciones/bloques'
import type { CapacitacionBloque } from '@/lib/types/capacitaciones'

export function CursoBloquesPreview({ bloques }: { bloques: CapacitacionBloque[] }) {
  const ordenados = normalizeBloquesOrden(bloques)

  if (ordenados.length === 0) {
    return (
      <Card>
        <CardBody className="text-sm text-muted">Este curso no tiene bloques de contenido.</CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {ordenados.map((bloque, index) => (
        <Card key={bloque.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Bloque {index + 1}
              </span>
              <StatusBadge variant="info">{BLOQUE_TIPO_LABELS[bloque.tipo]}</StatusBadge>
              {bloque.tipo === 'video_url' && bloque.obligatorio ? (
                <StatusBadge variant="warning">Obligatorio</StatusBadge>
              ) : null}
            </div>
            {bloque.titulo?.trim() ? (
              <div className="mt-2 text-base font-semibold text-app">{bloque.titulo}</div>
            ) : null}
          </CardHeader>
          <CardBody className="pt-0">
            <BloquePreviewContent bloque={bloque} />
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

function BloquePreviewContent({ bloque }: { bloque: CapacitacionBloque }) {
  switch (bloque.tipo) {
    case 'texto':
    case 'declaracion':
      return (
        <pre className="whitespace-pre-wrap rounded-2xl bg-surface-2 p-4 text-sm leading-relaxed">
          {bloque.contenido || '—'}
        </pre>
      )
    case 'video_url':
      return bloque.url ? (
        <div className="aspect-video overflow-hidden rounded-2xl border border-border bg-black">
          <iframe
            src={bloque.url}
            title={bloque.titulo || 'Video'}
            className="h-full w-full"
            allowFullScreen
          />
        </div>
      ) : (
        <p className="text-sm text-muted">Sin URL de video.</p>
      )
    case 'pdf_url':
      return bloque.url ? (
        <a
          href={bloque.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-[var(--color-brand)] underline"
        >
          Abrir PDF
        </a>
      ) : (
        <p className="text-sm text-muted">Sin URL de PDF.</p>
      )
    case 'imagen_url':
      return bloque.url ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bloque.url} alt={bloque.titulo || 'Imagen'} className="max-h-80 w-full object-contain" />
        </div>
      ) : (
        <p className="text-sm text-muted">Sin URL de imagen.</p>
      )
    case 'enlace_externo':
      return bloque.url ? (
        <a
          href={bloque.url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-sm font-semibold text-[var(--color-brand)] underline"
        >
          {bloque.url}
        </a>
      ) : (
        <p className="text-sm text-muted">Sin enlace.</p>
      )
    case 'evaluacion':
      return (
        <ul className="space-y-3">
          {(bloque.evaluacion_preguntas ?? []).map((p, i) => (
            <li key={p.id} className="rounded-xl bg-surface-2 p-3 text-sm">
              <div className="font-medium">
                {i + 1}. {p.enunciado || 'Pregunta sin enunciado'}
              </div>
              <ul className="mt-2 list-inside list-disc text-muted">
                {p.opciones.map((o, oi) => (
                  <li key={oi}>
                    {o}
                    {oi === p.respuesta_correcta_index ? ' ✓' : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
          <li className="text-xs text-muted">
            Puntaje mínimo: {bloque.puntaje_minimo ?? 80}%
          </li>
        </ul>
      )
    case 'firma':
      return (
        <div className="rounded-2xl border border-dashed border-border bg-surface-2 p-8 text-center text-sm text-muted">
          El operador firmará acá al completar el curso.
        </div>
      )
    default:
      return null
  }
}
