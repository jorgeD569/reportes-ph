'use client'

import * as React from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  BLOQUE_TIPO_LABELS,
  BLOQUE_TIPOS,
  createBloque,
  normalizeBloquesOrden,
  defaultEvaluacionPregunta,
} from '@/lib/capacitaciones/bloques'
import {
  inputClass,
  labelClass,
  textareaClass,
  btnSecondaryClass,
} from '@/components/capacitaciones/capacitaciones-form-styles'
import type { CapacitacionBloque, CapacitacionBloqueTipo } from '@/lib/types/capacitaciones'
import { cn } from '@/lib/cn'

type Props = {
  bloques: CapacitacionBloque[]
  onChange: (bloques: CapacitacionBloque[]) => void
  disabled?: boolean
}

export function CursoBloquesEditor({ bloques, onChange, disabled }: Props) {
  const [tipoNuevo, setTipoNuevo] = React.useState<CapacitacionBloqueTipo>('texto')

  function updateBloques(next: CapacitacionBloque[]) {
    onChange(normalizeBloquesOrden(next))
  }

  function addBloque() {
    updateBloques([...bloques, createBloque(tipoNuevo, bloques.length)])
  }

  function removeBloque(id: string) {
    updateBloques(bloques.filter((b) => b.id !== id))
  }

  function patchBloque(id: string, patch: Partial<CapacitacionBloque>) {
    updateBloques(bloques.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function moveBloque(id: string, dir: -1 | 1) {
    const sorted = normalizeBloquesOrden(bloques)
    const idx = sorted.findIndex((b) => b.id === id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= sorted.length) return
    const copy = [...sorted]
    ;[copy[idx], copy[target]] = [copy[target], copy[idx]]
    updateBloques(copy.map((b, i) => ({ ...b, orden: i })))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-app">Contenido del curso</div>
            <div className="mt-1 text-sm text-muted">
              Agregá bloques ordenables: texto, medios, evaluación, declaración y firma.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={cn(inputClass, 'h-10 w-auto min-w-[160px]')}
              value={tipoNuevo}
              onChange={(e) => setTipoNuevo(e.target.value as CapacitacionBloqueTipo)}
              disabled={disabled}
            >
              {BLOQUE_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {BLOQUE_TIPO_LABELS[t]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={btnSecondaryClass}
              onClick={addBloque}
              disabled={disabled}
            >
              + Agregar bloque
            </button>
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-4 pt-0">
        {bloques.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface-2 p-6 text-center text-sm text-muted">
            Todavía no hay bloques. Agregá al menos uno para armar el curso.
          </p>
        ) : null}

        {normalizeBloquesOrden(bloques).map((bloque, index) => (
          <div
            key={bloque.id}
            className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-app)]"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  #{index + 1}
                </span>
                <StatusBadge variant="info">{BLOQUE_TIPO_LABELS[bloque.tipo]}</StatusBadge>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2"
                  onClick={() => moveBloque(bloque.id, -1)}
                  disabled={disabled || index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2"
                  onClick={() => moveBloque(bloque.id, 1)}
                  disabled={disabled || index === bloques.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  onClick={() => removeBloque(bloque.id)}
                  disabled={disabled}
                >
                  Eliminar
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelClass}>Título (opcional)</label>
                <input
                  className={inputClass}
                  value={bloque.titulo ?? ''}
                  onChange={(e) => patchBloque(bloque.id, { titulo: e.target.value })}
                  disabled={disabled}
                  placeholder="Ej. Introducción, Video principal…"
                />
              </div>

              {bloque.tipo === 'texto' || bloque.tipo === 'declaracion' ? (
                <div>
                  <label className={labelClass}>
                    {bloque.tipo === 'declaracion' ? 'Texto de la declaración' : 'Contenido'}
                  </label>
                  <textarea
                    className={textareaClass}
                    rows={bloque.tipo === 'declaracion' ? 3 : 6}
                    value={bloque.contenido ?? ''}
                    onChange={(e) => patchBloque(bloque.id, { contenido: e.target.value })}
                    disabled={disabled}
                  />
                </div>
              ) : null}

              {bloque.tipo === 'video_url' ||
              bloque.tipo === 'pdf_url' ||
              bloque.tipo === 'imagen_url' ||
              bloque.tipo === 'enlace_externo' ? (
                <div>
                  <label className={labelClass}>URL</label>
                  <input
                    className={inputClass}
                    value={bloque.url ?? ''}
                    onChange={(e) => patchBloque(bloque.id, { url: e.target.value })}
                    disabled={disabled}
                    placeholder="https://…"
                  />
                </div>
              ) : null}

              {bloque.tipo === 'video_url' ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={bloque.obligatorio ?? true}
                    onChange={(e) =>
                      patchBloque(bloque.id, { obligatorio: e.target.checked })
                    }
                    disabled={disabled}
                    className="h-4 w-4"
                  />
                  Video obligatorio (debe marcarse como visto)
                </label>
              ) : null}

              {bloque.tipo === 'evaluacion' ? (
                <EvaluacionEditor
                  bloque={bloque}
                  onPatch={(patch) => patchBloque(bloque.id, patch)}
                  disabled={disabled}
                />
              ) : null}
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

function EvaluacionEditor({
  bloque,
  onPatch,
  disabled,
}: {
  bloque: CapacitacionBloque
  onPatch: (patch: Partial<CapacitacionBloque>) => void
  disabled?: boolean
}) {
  const preguntas = bloque.evaluacion_preguntas ?? []

  function patchPregunta(preguntaId: string, patch: Partial<(typeof preguntas)[0]>) {
    onPatch({
      evaluacion_preguntas: preguntas.map((p) =>
        p.id === preguntaId ? { ...p, ...patch } : p
      ),
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-2 p-4">
      <div>
        <label className={labelClass}>Puntaje mínimo (%)</label>
        <input
          type="number"
          min={0}
          max={100}
          className={cn(inputClass, 'max-w-[140px]')}
          value={bloque.puntaje_minimo ?? 80}
          onChange={(e) =>
            onPatch({ puntaje_minimo: Number(e.target.value) || 0 })
          }
          disabled={disabled}
        />
      </div>
      {preguntas.map((p, pi) => (
        <div key={p.id} className="space-y-2 rounded-lg border border-border bg-surface p-3">
          <div className="text-xs font-semibold uppercase text-muted">
            Pregunta {pi + 1}
          </div>
          <input
            className={inputClass}
            value={p.enunciado}
            onChange={(e) => patchPregunta(p.id, { enunciado: e.target.value })}
            placeholder="Enunciado"
            disabled={disabled}
          />
          {p.opciones.map((op, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${p.id}`}
                checked={p.respuesta_correcta_index === oi}
                onChange={() => patchPregunta(p.id, { respuesta_correcta_index: oi })}
                disabled={disabled}
              />
              <input
                className={inputClass}
                value={op}
                onChange={(e) => {
                  const opciones = [...p.opciones]
                  opciones[oi] = e.target.value
                  patchPregunta(p.id, { opciones })
                }}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      ))}
      <button
        type="button"
        className={btnSecondaryClass}
        disabled={disabled}
        onClick={() =>
          onPatch({
            evaluacion_preguntas: [...preguntas, defaultEvaluacionPregunta()],
          })
        }
      >
        + Agregar pregunta
      </button>
    </div>
  )
}
