'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CursoBloquesOperador } from '@/components/capacitaciones/CursoBloquesOperador'
import {
  btnPrimaryClass,
  btnSecondaryClass,
} from '@/components/capacitaciones/capacitaciones-form-styles'
import {
  extractLegacyFinalizarFields,
  validarCursoCompleto,
} from '@/lib/capacitaciones/bloques'
import {
  fetchAsignacionOperador,
  fetchCapacitacion,
  finalizarCapacitacionAsignacion,
} from '@/lib/capacitaciones/api'
import { MOCK_OPERADOR_ID } from '@/lib/capacitaciones/constants'
import {
  asignacionEstadoLabel,
  asignacionEstadoVariant,
} from '@/lib/capacitaciones/status'
import { routes } from '@/lib/constants/routes'
import { formatDateTimeEsAr } from '@/lib/date'
import type {
  BloqueProgreso,
  Capacitacion,
  CapacitacionAsignacion,
} from '@/lib/types/capacitaciones'

export function CapacitacionOperadorDetalleClient() {
  const params = useParams()
  const router = useRouter()
  const capacitacionId = params.id as string

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const [cap, setCap] = React.useState<Capacitacion | null>(null)
  const [asignacion, setAsignacion] = React.useState<CapacitacionAsignacion | null>(
    null
  )
  const [progreso, setProgreso] = React.useState<Record<string, BloqueProgreso>>({})

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [capacitacion, asig] = await Promise.all([
          fetchCapacitacion(capacitacionId),
          fetchAsignacionOperador(MOCK_OPERADOR_ID, capacitacionId),
        ])
        if (!cancelled) {
          setCap(capacitacion)
          setAsignacion(asig)
          setProgreso(asig?.progreso_bloques ?? {})
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error cargando capacitación')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [capacitacionId])

  const yaRealizada = asignacion?.estado === 'realizada'
  const vencida = asignacion?.estado === 'vencida'

  function patchProgreso(bloqueId: string, patch: Partial<BloqueProgreso>) {
    setProgreso((prev) => ({
      ...prev,
      [bloqueId]: { ...prev[bloqueId], ...patch },
    }))
  }

  async function onFinalizar() {
    setError(null)
    setSuccess(null)

    if (!asignacion || !cap) {
      setError('No tenés esta capacitación asignada.')
      return
    }

    const validacion = validarCursoCompleto(cap.bloques, progreso)
    if (!validacion.ok) {
      setError(validacion.errores[0] ?? 'Completá los bloques obligatorios del curso.')
      return
    }

    const legacy = extractLegacyFinalizarFields(cap.bloques, progreso)

    try {
      setSaving(true)
      const updated = await finalizarCapacitacionAsignacion(asignacion.id, {
        progreso_bloques: progreso,
        declaro_leido: legacy.declaro_leido,
        firma_data_url: legacy.firma_data_url,
      })
      setAsignacion(updated)
      setProgreso(updated.progreso_bloques)
      setSuccess('Capacitación finalizada correctamente.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo finalizar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingState label="Cargando capacitación…" />
  }

  if (!cap || !asignacion) {
    return (
      <EmptyState
        title="Capacitación no disponible"
        description="No encontramos esta asignación para tu usuario."
        action={
          <Link href={routes.operador.capacitaciones} className={btnSecondaryClass}>
            Volver al listado
          </Link>
        }
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-10">
      <PageHeader
        title={cap.titulo}
        subtitle={cap.descripcion}
        right={
          <Link href={routes.operador.capacitaciones} className={btnSecondaryClass}>
            Volver
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge variant={asignacionEstadoVariant(asignacion.estado)}>
          {asignacionEstadoLabel(asignacion.estado)}
        </StatusBadge>
        <StatusBadge variant="neutral">Versión {cap.version}</StatusBadge>
      </div>

      {error ? <InlineMessage kind="error" title="Error" description={error} /> : null}
      {success ? <InlineMessage kind="success" title={success} /> : null}
      {vencida && !yaRealizada ? (
        <InlineMessage
          kind="warning"
          title="Capacitación vencida"
          description="Contactá al coordinador para una nueva asignación."
        />
      ) : null}

      <CursoBloquesOperador
        bloques={cap.bloques}
        progreso={progreso}
        onProgresoChange={patchProgreso}
        readonly={yaRealizada}
        disabled={saving || vencida}
      />

      {yaRealizada ? (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Completada el {formatDateTimeEsAr(asignacion.fecha_realizacion)}.
            </p>
            <button
              type="button"
              className={btnSecondaryClass}
              onClick={() => router.push(routes.operador.capacitaciones)}
            >
              Volver al listado
            </button>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold text-app">Finalizar capacitación</div>
          </CardHeader>
          <CardBody className="pt-0">
            <p className="mb-4 text-sm text-muted">
              Completá todos los bloques obligatorios (declaración, evaluación, video y firma
              según corresponda) y luego confirmá.
            </p>
            <button
              type="button"
              className={btnPrimaryClass}
              disabled={saving || vencida}
              onClick={() => void onFinalizar()}
            >
              {saving ? 'Guardando…' : 'Finalizar capacitación'}
            </button>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
