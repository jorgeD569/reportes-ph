'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { PageHeader } from '@/components/ui/PageHeader'
import { CursoBloquesEditor } from '@/components/capacitaciones/CursoBloquesEditor'
import {
  COORD_BTN_PRIMARY_LG,
  COORD_BTN_SECONDARY_LG,
  COORD_INPUT_LG,
  COORD_LABEL,
  COORD_TEXTAREA,
} from '@/lib/coordinador/theme'
import { createBloque, normalizeBloquesOrden } from '@/lib/capacitaciones/bloques'
import { createCapacitacion } from '@/lib/capacitaciones/api'
import { routes } from '@/lib/constants/routes'
import type { CapacitacionBloque, CreateCapacitacionInput } from '@/lib/types/capacitaciones'

const labelClass = `${COORD_LABEL} mb-1.5 block`
const inputClass = COORD_INPUT_LG
const textareaClass = COORD_TEXTAREA

function contenidoResumenFromBloques(bloques: CapacitacionBloque[]): string {
  return bloques
    .filter((b) => b.tipo === 'texto' && b.contenido?.trim())
    .map((b) => b.contenido!.trim())
    .join('\n\n')
}

export default function NuevaCapacitacionPage() {
  const router = useRouter()
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [bloques, setBloques] = React.useState<CapacitacionBloque[]>(() => [
    createBloque('texto', 0),
  ])
  const [form, setForm] = React.useState<Omit<CreateCapacitacionInput, 'bloques' | 'contenido'>>({
    titulo: '',
    descripcion: '',
    version: '1.0',
    requiere_evaluacion: false,
    puntaje_minimo: null,
    dias_vigencia: 365,
    activa: true,
  })

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const bloquesNorm = normalizeBloquesOrden(bloques)

    if (!form.titulo.trim()) {
      setError('El título es obligatorio.')
      return
    }
    if (bloquesNorm.length === 0) {
      setError('Agregá al menos un bloque al curso.')
      return
    }

    const tieneEvaluacion = bloquesNorm.some((b) => b.tipo === 'evaluacion')

    try {
      setSaving(true)
      const cap = await createCapacitacion({
        ...form,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        contenido: contenidoResumenFromBloques(bloquesNorm),
        bloques: bloquesNorm,
        version: form.version.trim() || '1.0',
        requiere_evaluacion: form.requiere_evaluacion || tieneEvaluacion,
        puntaje_minimo:
          form.requiere_evaluacion || tieneEvaluacion ? form.puntaje_minimo : null,
      })
      router.push(routes.coordinador.capacitacionDetalle(cap.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const tieneEvaluacionBloque = bloques.some((b) => b.tipo === 'evaluacion')

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Nueva capacitación"
        subtitle="Armá el curso por bloques antes de publicarlo."
        right={
          <Link href={routes.coordinador.capacitaciones} className={COORD_BTN_SECONDARY_LG}>
            Volver al listado
          </Link>
        }
      />

      {error ? <InlineMessage kind="error" title="Error" description={error} /> : null}

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold text-app">Datos generales</div>
          </CardHeader>
          <CardBody className="space-y-4 pt-0">
            <div>
              <label className={labelClass} htmlFor="titulo">
                Título
              </label>
              <input
                id="titulo"
                className={inputClass}
                value={form.titulo}
                onChange={(e) => setField('titulo', e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="descripcion">
                Descripción
              </label>
              <textarea
                id="descripcion"
                className={textareaClass}
                rows={3}
                value={form.descripcion}
                onChange={(e) => setField('descripcion', e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="version">
                  Versión
                </label>
                <input
                  id="version"
                  className={inputClass}
                  value={form.version}
                  onChange={(e) => setField('version', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="dias_vigencia">
                  Días de vigencia
                </label>
                <input
                  id="dias_vigencia"
                  type="number"
                  min={1}
                  className={inputClass}
                  value={form.dias_vigencia}
                  onChange={(e) =>
                    setField('dias_vigencia', Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.requiere_evaluacion || tieneEvaluacionBloque}
                  onChange={(e) => setField('requiere_evaluacion', e.target.checked)}
                  disabled={tieneEvaluacionBloque}
                  className="h-4 w-4 rounded border-border"
                />
                Requiere evaluación
                {tieneEvaluacionBloque ? (
                  <span className="text-xs text-muted">(incluida en bloques)</span>
                ) : null}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={(e) => setField('activa', e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Activa
              </label>
            </div>
            {(form.requiere_evaluacion || tieneEvaluacionBloque) && !tieneEvaluacionBloque ? (
              <div>
                <label className={labelClass} htmlFor="puntaje_minimo">
                  Puntaje mínimo global
                </label>
                <input
                  id="puntaje_minimo"
                  type="number"
                  min={0}
                  max={100}
                  className={inputClass}
                  value={form.puntaje_minimo ?? ''}
                  onChange={(e) =>
                    setField(
                      'puntaje_minimo',
                      e.target.value === '' ? null : Number(e.target.value)
                    )
                  }
                />
              </div>
            ) : null}
          </CardBody>
        </Card>

        <CursoBloquesEditor bloques={bloques} onChange={setBloques} disabled={saving} />

        <div className="flex flex-wrap gap-3">
          <button type="submit" className={COORD_BTN_PRIMARY_LG} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar capacitación'}
          </button>
          <Link href={routes.coordinador.capacitaciones} className={COORD_BTN_SECONDARY_LG}>
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
