'use client'

import * as React from 'react'
import { ActivoDetalleModal } from '@/components/coordinador/inventario/ActivoDetalleModal'
import { ActivoTipoBadge } from '@/components/coordinador/inventario/ActivoTipoBadge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataField } from '@/components/ui/DataField'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { get, post } from '@/lib/api'
import { readAppUsuario } from '@/lib/auth'
import {
  COORD_BTN_PRIMARY,
  COORD_BTN_SECONDARY,
  COORD_INPUT_LG,
  COORD_LABEL,
  COORD_SECTION_MUTED,
  COORD_SECTION_TITLE,
  COORD_TEXT,
  COORD_TEXT_MUTED,
} from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'
import { formatTimestamptzDiaAR } from '@/lib/date'
import { canWriteComposicionConjuntos } from '@/lib/permissions'
import {
  labelCategoria,
  labelEstadoOperativo,
  newClientUuid,
} from '@/lib/inventario/labels'
import { CategoriaSelect } from '@/components/inventario/CategoriaSelect'
import {
  ACTIVOS_VINCULADOS_TITLE,
  ActivoVinculadoResumen,
  VINCULAR_ACTIVO_LABEL,
  VincularActivoModal,
} from '@/components/inventario/VincularActivo'
import type {
  Activo,
  ComponenteRelacion,
  GetActivoComposicionResponse,
  PostRetirarComponenteResponse,
} from '@/lib/types/inventario'

function display(v: string | null | undefined): string {
  const t = String(v ?? '').trim()
  return t === '' ? '—' : t
}

/** fecha_desde / fecha_hasta son timestamptz → día en America/Argentina/Buenos_Aires. */
function fechaDia(v: string | null | undefined): string {
  return formatTimestamptzDiaAR(v)
}

function usuarioActual(): string {
  const u = readAppUsuario()
  return u?.nombre?.trim() || u?.usuario?.trim() || 'Coordinador'
}

function matchManifoldQuery(a: Activo, q: string): boolean {
  if (!q) return true
  const hay = [a.numero_serie, a.descripcion, a.ubicacion, a.marca]
    .map((x) => String(x || '').toLowerCase())
    .join(' ')
  return hay.includes(q)
}

export function ManifoldsClient() {
  const canWrite = canWriteComposicionConjuntos(readAppUsuario()?.rol)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [manifolds, setManifolds] = React.useState<Activo[]>([])
  const [query, setQuery] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const [compLoading, setCompLoading] = React.useState(false)
  const [compError, setCompError] = React.useState<string | null>(null)
  const [composicion, setComposicion] =
    React.useState<GetActivoComposicionResponse | null>(null)

  const [detalleId, setDetalleId] = React.useState<string | null>(null)

  const [addOpen, setAddOpen] = React.useState(false)
  const [retirarRel, setRetirarRel] = React.useState<ComponenteRelacion | null>(null)
  const [nuevoOpen, setNuevoOpen] = React.useState(false)

  const loadManifolds = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await get<Activo[]>('/activos')
      const list = (data || []).filter((a) => a.es_conjunto === true)
      setManifolds(list)
      setSelectedId((prev) => {
        if (prev && list.some((a) => String(a.id) === prev)) return prev
        return list[0] ? String(list[0].id) : null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setManifolds([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de manifolds
    void loadManifolds()
  }, [loadManifolds])

  const loadComposicion = React.useCallback(async (id: string) => {
    setCompLoading(true)
    setCompError(null)
    try {
      const data = await get<GetActivoComposicionResponse>(
        `/activos/${encodeURIComponent(id)}/composicion`,
      )
      if (!data?.ok) throw new Error(data?.error || 'Respuesta inválida')
      setComposicion(data)
    } catch (e) {
      setComposicion(null)
      setCompError(e instanceof Error ? e.message : String(e))
    } finally {
      setCompLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!selectedId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch composición al seleccionar
    void loadComposicion(selectedId)
  }, [selectedId, loadComposicion])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return manifolds.filter((a) => matchManifoldQuery(a, q))
  }, [manifolds, query])

  const selected = composicion?.activo ?? manifolds.find((a) => String(a.id) === selectedId) ?? null
  const componentes = composicion?.componentes_actuales ?? []
  const inconsistencias = composicion?.inconsistencias_estado ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conjuntos de activos"
        subtitle="Consultá conjuntos existentes, su ubicación y activos vinculados. La app de campo es la vía principal de alta."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <Card>
          <CardHeader>
            <div>
              <div className={COORD_SECTION_TITLE}>Conjuntos</div>
              <div className={COORD_SECTION_MUTED}>
                Solo activos con es_conjunto = true.
              </div>
            </div>
            {canWrite ? (
              <button
                type="button"
                className={COORD_BTN_SECONDARY}
                onClick={() => setNuevoOpen(true)}
              >
                + Nuevo conjunto
              </button>
            ) : null}
          </CardHeader>
          <CardBody className="space-y-3 pt-0">
            <input
              className={COORD_INPUT_LG}
              placeholder="Buscar por serial o descripción…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar conjuntos"
            />
            {loading ? <LoadingState label="Cargando conjuntos…" /> : null}
            {error ? (
              <InlineMessage kind="error" title="No se pudieron cargar" description={error} />
            ) : null}
            {!loading && !error && manifolds.length === 0 ? (
              <EmptyState
                title="Todavía no hay conjuntos registrados"
                description="Cuando un activo se marque como conjunto, aparecerá aquí para administrar sus activos vinculados."
              />
            ) : null}
            {!loading && !error && manifolds.length > 0 && filtered.length === 0 ? (
              <EmptyState
                title="Sin resultados"
                description="Ningún conjunto coincide con la búsqueda."
              />
            ) : null}
            <ul className="max-h-[60vh] divide-y divide-slate-800 overflow-y-auto">
              {filtered.map((a) => {
                const active = String(a.id) === selectedId
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(String(a.id))}
                      className={cn(
                        'w-full cursor-pointer px-2 py-3 text-left transition',
                        active
                          ? 'bg-slate-800/80'
                          : 'hover:bg-slate-900/60',
                      )}
                    >
                      <div className="font-semibold text-white">
                        {a.numero_serie || 'Sin serie'}
                      </div>
                      <div className={cn('text-sm', COORD_TEXT_MUTED)}>
                        {a.descripcion || 'Sin descripción'}
                      </div>
                      <div className="mt-1">
                        <ActivoTipoBadge esConjunto />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <div className={COORD_SECTION_TITLE}>Detalle del conjunto</div>
              <div className={COORD_SECTION_MUTED}>
                {canWrite
                  ? 'Activos vinculados y acciones de composición.'
                  : 'Consulta de activos vinculados (solo lectura).'}
              </div>
            </div>
            {selected && canWrite ? (
              <button
                type="button"
                className={COORD_BTN_SECONDARY}
                onClick={() => setAddOpen(true)}
                disabled={!selectedId || compLoading}
              >
                {VINCULAR_ACTIVO_LABEL}
              </button>
            ) : null}
          </CardHeader>
          <CardBody className="space-y-5 pt-0">
            {!selectedId ? (
              <EmptyState
                title="Seleccioná un conjunto"
                description="Elegí un ítem de la lista para ver su composición."
              />
            ) : null}

            {compLoading ? <LoadingState label="Cargando composición…" /> : null}
            {compError ? (
              <InlineMessage
                kind="error"
                title="No se pudo cargar la composición"
                description={compError}
              />
            ) : null}

            {selected && !compLoading ? (
              <>
                {inconsistencias.length > 0 ? (
                  <InlineMessage
                    kind="warning"
                    title="Inconsistencia de estado"
                    description={
                      inconsistencias
                        .map(
                          (i) =>
                            i.mensaje ||
                            `Activo ${i.numero_serie || i.componente_id} fuera de servicio en conjunto operativo.`,
                        )
                        .join(' ')
                    }
                  />
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <DataField label="Número de serie" value={display(selected.numero_serie)} />
                  <DataField label="Descripción" value={display(selected.descripcion)} />
                  <DataField label="Categoría" value={labelCategoria(selected.categoria)} />
                  <DataField label="Estado" value={labelEstadoOperativo(selected.estado)} />
                  <DataField label="Ubicación" value={display(selected.ubicacion)} />
                  <DataField
                    label="Ubicación efectiva"
                    value={display(selected.ubicacion_efectiva ?? selected.ubicacion)}
                  />
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className={cn('text-sm font-semibold', COORD_TEXT)}>
                        {ACTIVOS_VINCULADOS_TITLE}
                      </div>
                      <div className={COORD_SECTION_MUTED}>Total: {componentes.length}</div>
                    </div>
                    <StatusBadge variant="info">{componentes.length}</StatusBadge>
                  </div>

                  {componentes.length === 0 ? (
                    <EmptyState
                      title="Sin activos vinculados"
                      description={
                        canWrite
                          ? 'Usá + Vincular activo para asociar equipos. Un conjunto puede existir vacío.'
                          : 'Este conjunto no tiene activos vinculados.'
                      }
                    />
                  ) : (
                    <ul className="space-y-2">
                      {componentes.map((rel) => {
                        const comp = rel.componente
                        const resumenActivo: Activo | null = comp
                          ? {
                              id: String(comp.id ?? rel.componente_id),
                              descripcion: comp.descripcion ?? null,
                              numero_serie: comp.numero_serie ?? null,
                              categoria: comp.categoria ?? null,
                              marca: null,
                              ubicacion: comp.ubicacion ?? null,
                              ubicacion_efectiva:
                                rel.ubicacion_efectiva ?? selected?.ubicacion ?? null,
                              asignado_a: null,
                              vencimiento: null,
                              estado: comp.estado ?? null,
                              es_conjunto: comp.es_conjunto === true,
                              es_componente: true,
                              pertenencia_actual: null,
                            }
                          : null
                        return (
                        <li
                          key={String(rel.id)}
                          className="rounded-xl border border-slate-700 bg-slate-900/50 p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1 text-sm">
                              {resumenActivo ? (
                                <ActivoVinculadoResumen
                                  activo={resumenActivo}
                                  vinculado
                                  onOpenDetalle={() =>
                                    setDetalleId(
                                      String(rel.componente?.id ?? rel.componente_id),
                                    )
                                  }
                                />
                              ) : (
                                <div className="font-semibold text-white">
                                  {display(String(rel.componente_id))}
                                </div>
                              )}
                              {rel.posicion ? (
                                <div className={COORD_TEXT_MUTED}>
                                  Posición: {display(rel.posicion)}
                                </div>
                              ) : null}
                              <div className={COORD_TEXT_MUTED}>
                                Vinculado: {fechaDia(rel.fecha_desde)}
                              </div>
                            </div>
                            {canWrite ? (
                              <button
                                type="button"
                                className={COORD_BTN_SECONDARY}
                                onClick={() => setRetirarRel(rel)}
                              >
                                Retirar
                              </button>
                            ) : null}
                          </div>
                        </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {canWrite ? (
        <VincularActivoModal
          open={addOpen}
          mode="immediate"
          conjunto={selected}
          excludeActivoIds={componentes.map((r) => r.componente_id)}
          excludeSeries={componentes.map(
            (r) => r.componente?.numero_serie || '',
          )}
          onClose={() => setAddOpen(false)}
          onLinked={async () => {
            setAddOpen(false)
            if (selectedId) await loadComposicion(selectedId)
            await loadManifolds()
          }}
          onTraspasoDone={async () => {
            if (selectedId) await loadComposicion(selectedId)
            await loadManifolds()
          }}
          onOpenDetalle={(a) => setDetalleId(String(a.id))}
        />
      ) : null}

      {canWrite ? (
        <RetirarComponenteModal
          open={retirarRel !== null}
          conjunto={selected}
          relacion={retirarRel}
          onClose={() => setRetirarRel(null)}
          onDone={async () => {
            setRetirarRel(null)
            if (selectedId) await loadComposicion(selectedId)
            await loadManifolds()
          }}
        />
      ) : null}

      <ActivoDetalleModal
        open={detalleId !== null}
        activoId={detalleId}
        onClose={() => setDetalleId(null)}
        onSelectActivoId={setDetalleId}
      />

      {canWrite ? (
        <NuevoConjuntoModal
          open={nuevoOpen}
          onClose={() => setNuevoOpen(false)}
          onCreated={async (id) => {
            setNuevoOpen(false)
            await loadManifolds()
            setSelectedId(String(id))
          }}
        />
      ) : null}
    </div>
  )
}

function NuevoConjuntoModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string | number) => Promise<void>
}) {
  if (!open) return null
  return (
    <NuevoConjuntoModalInner onClose={onClose} onCreated={onCreated} />
  )
}

function NuevoConjuntoModalInner({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string | number) => Promise<void>
}) {
  const [descripcion, setDescripcion] = React.useState('')
  const [serie, setSerie] = React.useState('')
  const [ubicacion, setUbicacion] = React.useState('')
  const [marca, setMarca] = React.useState('')
  const [categoriaId, setCategoriaId] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const savingRef = React.useRef(false)

  async function confirmar() {
    if (savingRef.current) return
    if (!descripcion.trim() || !serie.trim()) {
      setErr('Descripción y número de serie son obligatorios.')
      return
    }
    if (!categoriaId.trim()) {
      setErr('Seleccioná una categoría aplicable a conjuntos.')
      return
    }
    savingRef.current = true
    setSaving(true)
    setErr(null)
    try {
      const data = await post<{ ok: boolean; activo?: Activo; error?: string }>(
        '/activos',
        {
          descripcion: descripcion.trim(),
          numero_serie: serie.trim(),
          categoria_id: categoriaId,
          estado: 'operativo',
          marca: marca.trim() || null,
          ubicacion: ubicacion.trim() || null,
          es_conjunto: true,
          usuario: usuarioActual(),
        },
      )
      if (!data?.ok || !data.activo) {
        throw new Error(data?.error || 'No se pudo crear el conjunto')
      }
      await onCreated(data.activo.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (savingRef.current) return
        onClose()
      }}
      title="Nuevo conjunto"
      subtitle="Alta administrativa. Preferí la app de campo cuando sea posible."
      compact
      maxWidthClassName="w-[min(560px,calc(100vw-32px))] max-w-none"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={COORD_BTN_SECONDARY}
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={COORD_BTN_PRIMARY}
            disabled={saving}
            onClick={() => void confirmar()}
          >
            {saving ? 'Creando…' : 'Crear conjunto'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {err ? <InlineMessage kind="error" title="Error" description={err} /> : null}
        <label className={COORD_LABEL}>
          Categoría del conjunto
          <div className="mt-1">
            <CategoriaSelect
              className={`${COORD_INPUT_LG} normal-case`}
              value={categoriaId}
              aplicable="conjuntos"
              disabled={saving}
              onChange={(id) => setCategoriaId(id)}
            />
          </div>
        </label>
        <label className={COORD_LABEL}>
          Descripción
          <input
            className={`${COORD_INPUT_LG} mt-1 normal-case`}
            value={descripcion}
            disabled={saving}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>
        <label className={COORD_LABEL}>
          Número de serie
          <input
            className={`${COORD_INPUT_LG} mt-1 normal-case`}
            value={serie}
            disabled={saving}
            onChange={(e) => setSerie(e.target.value)}
          />
        </label>
        <label className={COORD_LABEL}>
          Ubicación
          <input
            className={`${COORD_INPUT_LG} mt-1 normal-case`}
            value={ubicacion}
            disabled={saving}
            onChange={(e) => setUbicacion(e.target.value)}
          />
        </label>
        <label className={COORD_LABEL}>
          Marca
          <input
            className={`${COORD_INPUT_LG} mt-1 normal-case`}
            value={marca}
            disabled={saving}
            onChange={(e) => setMarca(e.target.value)}
          />
        </label>
        <p className={cn('text-xs', COORD_TEXT_MUTED)}>
          Se crea como conjunto (es_conjunto=true), estado operativo y aprobado.
          La categoría sale del catálogo administrable. Los activos se vinculan
          después.
        </p>
      </div>
    </Modal>
  )
}

function RetirarComponenteModal({
  open,
  conjunto,
  relacion,
  onClose,
  onDone,
}: {
  open: boolean
  conjunto: Activo | null
  relacion: ComponenteRelacion | null
  onClose: () => void
  onDone: () => Promise<void>
}) {
  if (!open || !relacion) return null
  return (
    <RetirarComponenteModalInner
      key={String(relacion.id)}
      conjunto={conjunto}
      relacion={relacion}
      onClose={onClose}
      onDone={onDone}
    />
  )
}

function RetirarComponenteModalInner({
  conjunto,
  relacion,
  onClose,
  onDone,
}: {
  conjunto: Activo | null
  relacion: ComponenteRelacion
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [ubicacion, setUbicacion] = React.useState('')
  const [observaciones, setObservaciones] = React.useState('')
  const [err, setErr] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const savingRef = React.useRef(false)

  async function confirmar() {
    if (!conjunto || savingRef.current) return
    const nueva = ubicacion.trim()
    if (!nueva) {
      setErr('La nueva ubicación es obligatoria.')
      return
    }
    savingRef.current = true
    setSaving(true)
    setErr(null)
    try {
      await post<PostRetirarComponenteResponse>(
        `/activos/${encodeURIComponent(String(conjunto.id))}/componentes/${encodeURIComponent(String(relacion.componente_id))}/retirar`,
        {
          nueva_ubicacion: nueva,
          observaciones: observaciones.trim() || null,
          usuario: usuarioActual(),
        },
      )
      await onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const compSerie = relacion.componente?.numero_serie || relacion.componente_id

  return (
    <Modal
      open
      onClose={() => {
        if (savingRef.current) return
        onClose()
      }}
      title="Retirar componente"
      compact
      maxWidthClassName="w-[min(560px,calc(100vw-32px))] max-w-none"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={COORD_BTN_SECONDARY}
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={COORD_BTN_PRIMARY}
            disabled={saving}
            onClick={() => void confirmar()}
          >
            {saving ? 'Retirando…' : 'Confirmar retiro'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className={cn('text-sm', COORD_TEXT)}>
          Retirar componente <strong>{display(String(compSerie))}</strong> del conjunto{' '}
          <strong>{display(conjunto?.numero_serie || String(conjunto?.id ?? ''))}</strong>.
        </p>
        <p className={cn('text-sm', COORD_TEXT_MUTED)}>
          El historial de pertenencia no se elimina: solo se cierra la relación actual.
        </p>

        {err ? <InlineMessage kind="error" title="Error" description={err} /> : null}

        <label className={COORD_LABEL}>
          Nueva ubicación (obligatoria)
          <input
            className={`${COORD_INPUT_LG} mt-1 normal-case`}
            value={ubicacion}
            disabled={saving}
            onChange={(e) => setUbicacion(e.target.value)}
            required
          />
        </label>

        <label className={COORD_LABEL}>
          Observaciones (opcional)
          <textarea
            className={`${COORD_INPUT_LG} mt-1 min-h-[80px] normal-case`}
            value={observaciones}
            disabled={saving}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  )
}

