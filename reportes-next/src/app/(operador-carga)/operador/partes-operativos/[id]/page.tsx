'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ParteOperativoFlowSteps } from '@/components/operador/ParteOperativoFlowSteps'
import {
  btnPrimaryClass,
  btnSecondaryClass,
  inputClass,
  labelClass,
  textareaClass,
} from '@/components/operador/parte-operativo-styles'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataField } from '@/components/ui/DataField'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { get, put } from '@/lib/api'
import { routes } from '@/lib/constants/routes'
import { openPartePhWithPrefill, type PartePhPrefill } from '@/lib/parte-ph-prefill'

type ParteOperativo = {
  id: string
  numero_parte?: number | string | null
  reporte_numero?: number | string | null
  fecha?: string | null
  pozo?: string | null
  yacimiento?: string | null
  operadora?: string | null
  contratista?: string | null
  unidad_pesada?: string | null
  estado?: string | null
  observaciones?: string | null
}

function buildPrefillFromParte(parte: ParteOperativo): PartePhPrefill {
  const reporteNumero =
    parte.reporte_numero != null && String(parte.reporte_numero).trim() !== ''
      ? String(parte.reporte_numero)
      : parte.numero_parte != null
        ? String(parte.numero_parte)
        : ''

  return {
    parte_operativo_id: parte.id,
    reporte_numero: reporteNumero,
    fecha: parte.fecha ?? '',
    pozo: parte.pozo ?? '',
    yacimiento: parte.yacimiento ?? '',
    cliente: parte.operadora ?? '',
    contratista: parte.contratista ?? '',
  }
}

type GetParteOperativoResponse = {
  ok?: boolean
  parte: ParteOperativo
  error?: string
}

export default function ParteOperativoDetallePage() {
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parte, setParte] = useState<ParteOperativo | null>(null)
  const [observaciones, setObservaciones] = useState('')

  useEffect(() => {
    if (id) {
      void cargarParte()
    }
  }, [id])

  async function cargarParte() {
    try {
      setLoading(true)
      setError(null)

      const data = await get<GetParteOperativoResponse>(
        `/partes-operativos/${encodeURIComponent(id)}`
      )

      if (!data.ok || !data.parte) {
        throw new Error(data.error || 'Error obteniendo parte')
      }

      setParte(data.parte)
      setObservaciones(data.parte.observaciones || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando parte')
    } finally {
      setLoading(false)
    }
  }

  async function guardarObservaciones() {
    try {
      setSaving(true)
      setError(null)

      const data = await put<{ ok?: boolean; error?: string }>(
        `/partes-operativos/${encodeURIComponent(id)}`,
        { observaciones }
      )

      if (data.ok === false) {
        throw new Error(data.error || 'Error guardando')
      }

      window.location.href = routes.operador.parteOperativoServicios(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando observaciones')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingState label="Cargando parte operativo..." />
  }

  if (!parte) {
    return (
      <InlineMessage
        kind="error"
        title="Parte no encontrado"
        description={error || 'No se pudo cargar el parte.'}
      />
    )
  }

  const parteCargado = parte

  const estadoVariant =
    parteCargado.estado === 'cerrado'
      ? 'success'
      : parteCargado.estado === 'abierto'
      ? 'info'
      : 'neutral'

  function abrirFormularioPh() {
    openPartePhWithPrefill(buildPrefillFromParte(parteCargado))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Parte operativo N° ${parte.numero_parte ?? '—'}`}
        subtitle="Completá observaciones y continuá con servicios para cerrar el parte."
        right={
          <StatusBadge variant={estadoVariant}>
            {parte.estado || '—'}
          </StatusBadge>
        }
      />

      <ParteOperativoFlowSteps current="observaciones" />

      {error ? (
        <InlineMessage kind="error" title="Error" description={error} />
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <div className="text-sm font-semibold text-app">Resumen del parte</div>
            <div className="mt-1 text-sm text-muted">
              Datos cargados al crear el parte operativo.
            </div>
          </div>
        </CardHeader>
        <CardBody className="pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <DataField label="Pozo" value={parte.pozo || '—'} />
            <DataField label="Yacimiento" value={parte.yacimiento || '—'} />
            <DataField label="Operadora" value={parte.operadora || '—'} />
            <DataField label="Contratista" value={parte.contratista || 'KOMPASS'} />
            <DataField label="Unidad pesada" value={parte.unidad_pesada || '—'} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <div className="text-sm font-semibold text-app">Reportes PH</div>
            <div className="mt-1 text-sm text-muted">
              Cargá ensayos PH usando el mismo número de parte ({parte.numero_parte ?? '—'}) en el
              formulario.
            </div>
          </div>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-3 pt-0">
          <button
            type="button"
            className={btnSecondaryClass}
            onClick={abrirFormularioPh}
          >
            Abrir formulario PH
          </button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <div className="text-sm font-semibold text-app">Observaciones</div>
            <div className="mt-1 text-sm text-muted">
              Registrá novedades, condiciones del pozo o aclaraciones del operador.
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-4 pt-0">
          <div>
            <label className={labelClass} htmlFor="observaciones">
              Observaciones del parte
            </label>
            <textarea
              id="observaciones"
              className={textareaClass}
              rows={8}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Escribí las observaciones del parte operativo..."
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={btnPrimaryClass}
              onClick={guardarObservaciones}
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar y continuar'}
            </button>
            <button
               type="button"
               className={btnSecondaryClass}
               onClick={guardarObservaciones}
               disabled={saving}
            >
               {saving ? 'Guardando...' : 'Ir a servicios'}
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
