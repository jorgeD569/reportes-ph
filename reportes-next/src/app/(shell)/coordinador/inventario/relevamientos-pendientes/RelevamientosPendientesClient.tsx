'use client'

import * as React from 'react'
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
} from '@/lib/coordinador/theme'
import { formatFechaAR } from '@/lib/date'
import type {
  Activo,
  ActivoAdjunto,
  GetActivoAdjuntosResponse,
  GetActivosPendientesResponse,
} from '@/lib/types/inventario'
import { categoriasActivo, estadosActivo } from '@/app/(shell)/coordinador/inventario/gestion/inventarioGestionConstants'

type EditForm = {
  descripcion: string
  categoria: string
  numero_serie: string
  marca: string
  estado: string
  ubicacion: string
  asignado_a: string
  vencimiento: string
  observaciones: string
}

function toEditForm(a: Activo): EditForm {
  return {
    descripcion: a.descripcion ?? '',
    categoria: a.categoria ?? '',
    numero_serie: a.numero_serie ?? '',
    marca: a.marca ?? '',
    estado: a.estado ?? 'operativo',
    ubicacion: a.ubicacion ?? '',
    asignado_a: a.asignado_a ?? '',
    vencimiento: a.vencimiento ? String(a.vencimiento).slice(0, 10) : '',
    observaciones: a.observaciones ?? '',
  }
}

function usuarioActual(): string {
  const u = readAppUsuario()
  return u?.nombre?.trim() || u?.usuario?.trim() || 'Coordinador'
}

export function RelevamientosPendientesClient() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [activos, setActivos] = React.useState<Activo[]>([])
  const [selected, setSelected] = React.useState<Activo | null>(null)
  const [adjuntos, setAdjuntos] = React.useState<ActivoAdjunto[]>([])
  const [editForm, setEditForm] = React.useState<EditForm | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [actionMsg, setActionMsg] = React.useState<string | null>(null)
  const [actionErr, setActionErr] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await get<GetActivosPendientesResponse>('/activos-pendientes')
      setActivos(Array.isArray(data.activos) ? data.activos : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setActivos([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  async function openDetalle(a: Activo) {
    setSelected(a)
    setEditForm(toEditForm(a))
    setActionMsg(null)
    setActionErr(null)
    setAdjuntos([])
    try {
      const data = await get<GetActivoAdjuntosResponse>(
        `/activos/${encodeURIComponent(a.id)}/adjuntos`
      )
      setAdjuntos(Array.isArray(data.adjuntos) ? data.adjuntos : [])
    } catch {
      setAdjuntos([])
    }
  }

  async function aprobar() {
    if (!selected || !editForm) return
    if (!window.confirm('¿Aprobar este relevamiento y habilitarlo en el inventario?')) {
      return
    }
    setBusy(true)
    setActionErr(null)
    setActionMsg(null)
    try {
      // Guardar ediciones vía patch del endpoint de aprobación
      const data = await post<{ ok: boolean; activo?: Activo; error?: string }>(
        `/activos/${encodeURIComponent(selected.id)}/aprobar`,
        {
          usuario: usuarioActual(),
          patch: {
            descripcion: editForm.descripcion.trim(),
            categoria: editForm.categoria.trim(),
            numero_serie: editForm.numero_serie.trim(),
            marca: editForm.marca.trim() || null,
            estado: editForm.estado.trim() || 'operativo',
            ubicacion: editForm.ubicacion.trim() || null,
            asignado_a: editForm.asignado_a.trim() || null,
            vencimiento: editForm.vencimiento.trim() || null,
            observaciones: editForm.observaciones.trim() || null,
          },
        }
      )
      if (!data?.ok) throw new Error(data?.error || 'No se pudo aprobar')
      setActionMsg('Relevamiento aprobado. Ya figura en el inventario operativo.')
      setSelected(null)
      await load()
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function rechazar() {
    if (!selected) return
    const motivo =
      window.prompt('Motivo del rechazo (obligatorio):', '')?.trim() || ''
    if (!motivo) return
    if (!window.confirm('¿Confirmar rechazo? El activo no se eliminará.')) return

    setBusy(true)
    setActionErr(null)
    setActionMsg(null)
    try {
      const data = await post<{ ok: boolean; error?: string }>(
        `/activos/${encodeURIComponent(selected.id)}/rechazar`,
        { usuario: usuarioActual(), motivo }
      )
      if (!data?.ok) throw new Error(data?.error || 'No se pudo rechazar')
      setActionMsg('Relevamiento rechazado. Ya no aparece en pendientes.')
      setSelected(null)
      await load()
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relevamientos pendientes"
        subtitle="Revisión de activos cargados desde la app de campo. No incluye activos inactivos históricos."
      />

      {actionMsg ? <InlineMessage kind="success" title="Listo" description={actionMsg} /> : null}
      {actionErr && !selected ? (
        <InlineMessage kind="error" title="Error" description={actionErr} />
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <div className={COORD_SECTION_TITLE}>Cola de revisión</div>
            <div className={COORD_SECTION_MUTED}>
              Solo `estado_revision = pendiente`. Aprobar habilita (`activo=true`). Rechazar
              mantiene el registro fuera del inventario operativo.
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-4 pt-0">
          {loading ? <LoadingState label="Cargando relevamientos…" /> : null}
          {error ? (
            <InlineMessage kind="error" title="No se pudieron cargar" description={error} />
          ) : null}
          {!loading && !error && activos.length === 0 ? (
            <EmptyState
              title="Sin relevamientos pendientes"
              description="Cuando un operador sincronice un activo desde la app, aparecerá aquí."
            />
          ) : null}
          <ul className="divide-y divide-slate-800">
            {activos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-semibold text-white">
                    {a.descripcion || 'Sin descripción'}
                  </div>
                  <div className="text-sm text-slate-400">
                    Serie: {a.numero_serie || '—'} · {a.categoria || '—'} ·{' '}
                    {formatFechaAR(a.vencimiento) !== '-'
                      ? `Vence ${formatFechaAR(a.vencimiento)}`
                      : 'Sin vencimiento'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge variant="warning">Pendiente</StatusBadge>
                  <button
                    type="button"
                    className={COORD_BTN_SECONDARY}
                    onClick={() => void openDetalle(a)}
                  >
                    Revisar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Modal
        open={!!selected}
        onClose={() => (!busy ? setSelected(null) : undefined)}
        title="Revisar relevamiento"
      >
        {selected && editForm ? (
          <div className="space-y-4">
            {actionErr ? (
              <InlineMessage kind="error" title="Error" description={actionErr} />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <DataField label="ID" value={String(selected.id)} />
              <DataField label="Revisión" value={selected.estado_revision || 'pendiente'} />
            </div>

            <label className={COORD_LABEL}>
              Descripción
              <input
                className={COORD_INPUT_LG}
                value={editForm.descripcion}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, descripcion: e.target.value } : f))
                }
              />
            </label>
            <label className={COORD_LABEL}>
              N° serie
              <input
                className={COORD_INPUT_LG}
                value={editForm.numero_serie}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, numero_serie: e.target.value } : f))
                }
              />
            </label>
            <label className={COORD_LABEL}>
              Categoría
              <select
                className={COORD_INPUT_LG}
                value={editForm.categoria}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, categoria: e.target.value } : f))
                }
              >
                {[editForm.categoria, 'unidad', 'wika', 'linea', 'herramienta', 'seguridad', 'otro', ...categoriasActivo]
                  .filter((v, i, arr) => v && arr.indexOf(v) === i)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </label>
            <label className={COORD_LABEL}>
              Estado operativo
              <select
                className={COORD_INPUT_LG}
                value={editForm.estado}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, estado: e.target.value } : f))
                }
              >
                {['operativo', 'fuera de servicio', 'en reparacion', 'vencido', 'baja', ...estadosActivo]
                  .filter((v, i, arr) => arr.indexOf(v) === i)
                  .map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
              </select>
            </label>
            <label className={COORD_LABEL}>
              Marca
              <input
                className={COORD_INPUT_LG}
                value={editForm.marca}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, marca: e.target.value } : f))
                }
              />
            </label>
            <label className={COORD_LABEL}>
              Ubicación
              <input
                className={COORD_INPUT_LG}
                value={editForm.ubicacion}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, ubicacion: e.target.value } : f))
                }
              />
            </label>
            <label className={COORD_LABEL}>
              Asignado a
              <input
                className={COORD_INPUT_LG}
                value={editForm.asignado_a}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, asignado_a: e.target.value } : f))
                }
              />
            </label>
            <label className={COORD_LABEL}>
              Vencimiento
              <input
                type="date"
                className={COORD_INPUT_LG}
                value={editForm.vencimiento}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, vencimiento: e.target.value } : f))
                }
              />
            </label>
            <label className={COORD_LABEL}>
              Observaciones
              <textarea
                className={COORD_INPUT_LG}
                rows={3}
                value={editForm.observaciones}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, observaciones: e.target.value } : f))
                }
              />
            </label>

            <div>
              <div className={COORD_SECTION_TITLE}>Fotografías / certificado</div>
              {adjuntos.length === 0 ? (
                <p className="text-sm text-slate-400">Sin adjuntos sincronizados.</p>
              ) : (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {adjuntos.map((adj) => {
                    const viewUrl = adj.url_firmada || null
                    return (
                    <div key={String(adj.id)} className="rounded border border-slate-700 p-2">
                      <div className="mb-1 text-xs uppercase text-slate-400">{adj.tipo}</div>
                      {viewUrl && String(adj.mime_type || '').startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={viewUrl}
                          alt={adj.tipo}
                          className="max-h-48 w-full object-contain"
                        />
                      ) : viewUrl ? (
                        <a
                          className="text-sky-400 underline"
                          href={viewUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir archivo
                        </a>
                      ) : (
                        <span className="text-slate-500">{adj.storage_path}</span>
                      )}
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                className={COORD_BTN_SECONDARY}
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className={COORD_BTN_SECONDARY}
                disabled={busy}
                onClick={() => void rechazar()}
              >
                Rechazar
              </button>
              <button
                type="button"
                className={COORD_BTN_PRIMARY}
                disabled={busy}
                onClick={() => void aprobar()}
              >
                {busy ? 'Procesando…' : 'Aprobar'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
