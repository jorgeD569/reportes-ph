'use client'

import * as React from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  SignaturePad,
  type SignaturePadHandle,
} from '@/components/capacitaciones/SignaturePad'
import { btnSecondaryClass } from '@/components/capacitaciones/capacitaciones-form-styles'
import {
  BLOQUE_TIPO_LABELS,
  calcularPuntajeEvaluacion,
  evaluacionAprobada,
  normalizeBloquesOrden,
} from '@/lib/capacitaciones/bloques'
import type { BloqueProgreso, CapacitacionBloque } from '@/lib/types/capacitaciones'
import { cn } from '@/lib/cn'

type Props = {
  bloques: CapacitacionBloque[]
  progreso: Record<string, BloqueProgreso>
  onProgresoChange: (bloqueId: string, patch: Partial<BloqueProgreso>) => void
  readonly?: boolean
  disabled?: boolean
}

export function CursoBloquesOperador({
  bloques,
  progreso,
  onProgresoChange,
  readonly,
  disabled,
}: Props) {
  const ordenados = normalizeBloquesOrden(bloques)

  return (
    <div className="space-y-4">
      {ordenados.map((bloque, index) => (
        <Card key={bloque.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Paso {index + 1}
              </span>
              <StatusBadge variant="info">{BLOQUE_TIPO_LABELS[bloque.tipo]}</StatusBadge>
              <BloqueEstadoBadge bloque={bloque} progreso={progreso[bloque.id]} />
            </div>
            {bloque.titulo?.trim() ? (
              <div className="mt-2 text-base font-semibold text-app">{bloque.titulo}</div>
            ) : null}
          </CardHeader>
          <CardBody className="pt-0">
            <BloqueOperadorContent
              bloque={bloque}
              progreso={progreso[bloque.id]}
              onProgresoChange={(patch) => onProgresoChange(bloque.id, patch)}
              readonly={readonly}
              disabled={disabled}
            />
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

function BloqueEstadoBadge({
  bloque,
  progreso,
}: {
  bloque: CapacitacionBloque
  progreso?: BloqueProgreso
}) {
  const ok = bloqueCompletado(bloque, progreso)
  if (!['declaracion', 'firma', 'evaluacion', 'video_url'].includes(bloque.tipo)) {
    return null
  }
  if (bloque.tipo === 'video_url' && !bloque.obligatorio) return null
  return (
    <StatusBadge variant={ok ? 'success' : 'warning'}>
      {ok ? 'Completo' : 'Pendiente'}
    </StatusBadge>
  )
}

function bloqueCompletado(bloque: CapacitacionBloque, progreso?: BloqueProgreso): boolean {
  if (!progreso) return false
  switch (bloque.tipo) {
    case 'declaracion':
      return !!progreso.declaracion_aceptada
    case 'firma':
      return !!progreso.firma_data_url?.trim()
    case 'video_url':
      return !bloque.obligatorio || !!progreso.video_visto
    case 'evaluacion':
      return evaluacionAprobada(bloque, progreso.evaluacion_respuestas)
    default:
      return true
  }
}

function BloqueOperadorContent({
  bloque,
  progreso,
  onProgresoChange,
  readonly,
  disabled,
}: {
  bloque: CapacitacionBloque
  progreso?: BloqueProgreso
  onProgresoChange: (patch: Partial<BloqueProgreso>) => void
  readonly?: boolean
  disabled?: boolean
}) {
  const signatureRef = React.useRef<SignaturePadHandle>(null)

  switch (bloque.tipo) {
    case 'texto':
      return (
        <pre className="whitespace-pre-wrap rounded-2xl bg-surface-2 p-4 text-sm leading-relaxed">
          {bloque.contenido || '—'}
        </pre>
      )
    case 'video_url':
      return (
        <div className="space-y-3">
          {bloque.url ? (
            <div className="aspect-video overflow-hidden rounded-2xl border border-border bg-black">
              <iframe
                src={bloque.url}
                title={bloque.titulo || 'Video'}
                className="h-full w-full"
                allowFullScreen
              />
            </div>
          ) : (
            <p className="text-sm text-muted">Video no configurado.</p>
          )}
          {bloque.obligatorio && !readonly ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={!!progreso?.video_visto}
                onChange={(e) => onProgresoChange({ video_visto: e.target.checked })}
                disabled={disabled}
              />
              <span className="text-sm">Confirmo haber visto el video completo</span>
            </label>
          ) : progreso?.video_visto ? (
            <StatusBadge variant="success">Video visto</StatusBadge>
          ) : null}
        </div>
      )
    case 'pdf_url':
      return bloque.url ? (
        <a
          href={bloque.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(btnSecondaryClass, 'inline-flex')}
        >
          Abrir PDF
        </a>
      ) : (
        <p className="text-sm text-muted">PDF no configurado.</p>
      )
    case 'imagen_url':
      return bloque.url ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bloque.url}
            alt={bloque.titulo || 'Imagen'}
            className="max-h-96 w-full object-contain"
          />
        </div>
      ) : (
        <p className="text-sm text-muted">Imagen no configurada.</p>
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
        <p className="text-sm text-muted">Enlace no configurado.</p>
      )
    case 'declaracion':
      return (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0"
            checked={!!progreso?.declaracion_aceptada}
            onChange={(e) =>
              onProgresoChange({ declaracion_aceptada: e.target.checked })
            }
            disabled={disabled || readonly}
          />
          <span className="text-sm leading-snug">
            {bloque.contenido?.trim() ||
              'Declaro haber leído y comprendido la capacitación'}
          </span>
        </label>
      )
    case 'evaluacion': {
      const preguntas = bloque.evaluacion_preguntas ?? []
      const puntaje = calcularPuntajeEvaluacion(bloque, progreso?.evaluacion_respuestas)
      const aprobada = evaluacionAprobada(bloque, progreso?.evaluacion_respuestas)
      const todasRespondidas = preguntas.every(
        (p) => progreso?.evaluacion_respuestas?.[p.id] !== undefined
      )

      return (
        <div className="space-y-4">
          {preguntas.map((p, i) => (
            <fieldset
              key={p.id}
              className="rounded-xl border border-border bg-surface-2 p-4"
              disabled={disabled || readonly}
            >
              <legend className="px-1 text-sm font-semibold text-app">
                {i + 1}. {p.enunciado || 'Pregunta'}
              </legend>
              <ul className="mt-3 space-y-2">
                {p.opciones.map((op, oi) => (
                  <li key={oi}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`preg-${p.id}`}
                        checked={progreso?.evaluacion_respuestas?.[p.id] === oi}
                        onChange={() =>
                          onProgresoChange({
                            evaluacion_respuestas: {
                              ...progreso?.evaluacion_respuestas,
                              [p.id]: oi,
                            },
                          })
                        }
                      />
                      {op}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
          {todasRespondidas ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Puntaje: {puntaje}%</span>
              <StatusBadge variant={aprobada ? 'success' : 'danger'}>
                {aprobada ? 'Aprobado' : `Mínimo ${bloque.puntaje_minimo ?? 80}%`}
              </StatusBadge>
            </div>
          ) : null}
        </div>
      )
    }
    case 'firma':
      if (readonly && progreso?.firma_data_url) {
        return (
          <div className="rounded-2xl border border-border bg-white p-2 dark:bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={progreso.firma_data_url}
              alt="Firma"
              className="mx-auto max-h-32 w-full object-contain"
            />
          </div>
        )
      }
      return (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Firma (dedo o mouse)
          </div>
          <SignaturePad
            ref={signatureRef}
            disabled={disabled || readonly}
            onChange={(empty) => {
              if (!empty) {
                const data = signatureRef.current?.toDataURL()
                if (data) onProgresoChange({ firma_data_url: data })
              } else {
                onProgresoChange({ firma_data_url: null })
              }
            }}
          />
        </div>
      )
    default:
      return null
  }
}
