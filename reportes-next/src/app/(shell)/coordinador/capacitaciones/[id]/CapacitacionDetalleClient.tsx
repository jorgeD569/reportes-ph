'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataField } from '@/components/ui/DataField'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { ModernTable, Td, Th } from '@/components/ui/ModernTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  btnPrimaryClass,
  btnSecondaryClass,
} from '@/components/capacitaciones/capacitaciones-form-styles'
import { CursoBloquesPreview } from '@/components/capacitaciones/CursoBloquesPreview'
import {
  assignCapacitacionToOperadores,
  fetchAsignacionesCapacitacion,
  fetchCapacitacion,
} from '@/lib/capacitaciones/api'
import { MOCK_OPERADORES } from '@/lib/capacitaciones/constants'
import {
  asignacionEstadoLabel,
  asignacionEstadoVariant,
} from '@/lib/capacitaciones/status'
import { routes } from '@/lib/constants/routes'
import { formatDateTimeEsAr, formatFechaSoloDia } from '@/lib/date'
import type { Capacitacion, CapacitacionAsignacion } from '@/lib/types/capacitaciones'

export function CapacitacionDetalleClient() {
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [cap, setCap] = React.useState<Capacitacion | null>(null)
  const [asignaciones, setAsignaciones] = React.useState<CapacitacionAsignacion[]>([])
  const [modalOpen, setModalOpen] = React.useState(false)
  const [selectedOperadores, setSelectedOperadores] = React.useState<string[]>([])
  const [assigning, setAssigning] = React.useState(false)
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const [capacitacion, asigs] = await Promise.all([
      fetchCapacitacion(id),
      fetchAsignacionesCapacitacion(id),
    ])
    setCap(capacitacion)
    setAsignaciones(asigs)
  }, [id])

  React.useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        setLoading(true)
        setError(null)
        await load()
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error cargando detalle')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [load])

  const operadoresDisponibles = React.useMemo(() => {
    const asignados = new Set(asignaciones.map((a) => a.operador_id))
    return MOCK_OPERADORES.filter((o) => !asignados.has(o.id))
  }, [asignaciones])

  function toggleOperador(operadorId: string) {
    setSelectedOperadores((prev) =>
      prev.includes(operadorId)
        ? prev.filter((x) => x !== operadorId)
        : [...prev, operadorId]
    )
  }

  async function onAssign() {
    if (selectedOperadores.length === 0) {
      setError('Seleccioná al menos un operador.')
      return
    }
    try {
      setAssigning(true)
      setError(null)
      await assignCapacitacionToOperadores(id, selectedOperadores)
      setSuccessMsg('Capacitación asignada correctamente.')
      setModalOpen(false)
      setSelectedOperadores([])
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al asignar')
    } finally {
      setAssigning(false)
    }
  }

  if (loading) {
    return <LoadingState label="Cargando capacitación…" />
  }

  if (!cap) {
    return (
      <EmptyState
        title="Capacitación no encontrada"
        action={
          <Link href={routes.coordinador.capacitaciones} className={btnSecondaryClass}>
            Volver al listado
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={cap.titulo}
        subtitle={`Versión ${cap.version} · Capacitaciones HSE`}
        right={
          <div className="flex flex-wrap gap-2">
            <Link href={routes.coordinador.capacitaciones} className={btnSecondaryClass}>
              Volver
            </Link>
            <button
              type="button"
              className={btnPrimaryClass}
              onClick={() => {
                setError(null)
                setModalOpen(true)
              }}
              disabled={operadoresDisponibles.length === 0}
            >
              Asignar operadores
            </button>
          </div>
        }
      />

      {error ? <InlineMessage kind="error" title="Error" description={error} /> : null}
      {successMsg ? (
        <InlineMessage kind="success" title={successMsg} />
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={cap.activa ? 'success' : 'neutral'}>
              {cap.activa ? 'Activa' : 'Inactiva'}
            </StatusBadge>
            {cap.requiere_evaluacion ? (
              <StatusBadge variant="info">
                Evaluación min. {cap.puntaje_minimo ?? 0}%
              </StatusBadge>
            ) : null}
          </div>
        </CardHeader>
        <CardBody className="grid gap-4 pt-0 sm:grid-cols-2">
          <DataField label="Descripción" value={cap.descripcion || '—'} />
          <DataField label="Vigencia" value={`${cap.dias_vigencia} días`} />
          <DataField label="Creación" value={formatDateTimeEsAr(cap.created_at)} />
        </CardBody>
      </Card>

      <div>
        <div className="mb-3 text-sm font-semibold text-app">Contenido del curso</div>
        <CursoBloquesPreview bloques={cap.bloques} />
      </div>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold text-app">Operadores asignados</div>
        </CardHeader>
        <CardBody className="pt-0">
          {asignaciones.length === 0 ? (
            <EmptyState
              title="Sin asignaciones"
              description="Asigná operadores para que completen la capacitación."
            />
          ) : (
            <ModernTable className="border-0">
              <thead>
                <tr>
                  <Th>Operador</Th>
                  <Th>Estado</Th>
                  <Th>Vencimiento</Th>
                  <Th>Realizada</Th>
                </tr>
              </thead>
              <tbody>
                {asignaciones.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <Td>{a.operador_nombre}</Td>
                    <Td>
                      <StatusBadge variant={asignacionEstadoVariant(a.estado)}>
                        {asignacionEstadoLabel(a.estado)}
                      </StatusBadge>
                    </Td>
                    <Td>{formatFechaSoloDia(a.fecha_vencimiento)}</Td>
                    <Td>
                      {a.fecha_realizacion
                        ? formatDateTimeEsAr(a.fecha_realizacion)
                        : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ModernTable>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => !assigning && setModalOpen(false)}
        title="Asignar operadores"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={btnSecondaryClass}
              onClick={() => setModalOpen(false)}
              disabled={assigning}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btnPrimaryClass}
              onClick={() => void onAssign()}
              disabled={assigning || selectedOperadores.length === 0}
            >
              {assigning ? 'Asignando…' : 'Confirmar asignación'}
            </button>
          </div>
        }
      >
        <p className="mb-4 text-sm text-muted">
          Seleccioná los operadores que deben realizar esta capacitación.
        </p>
        <ul className="space-y-2">
          {operadoresDisponibles.map((op) => (
            <li key={op.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={selectedOperadores.includes(op.id)}
                  onChange={() => toggleOperador(op.id)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">{op.nombre}</span>
              </label>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
