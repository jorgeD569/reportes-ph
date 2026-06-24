'use client'

import * as React from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { get, put } from '@/lib/api'
import { readAppUsuario } from '@/lib/auth'
import {
  COORD_BTN_PRIMARY_LG,
  COORD_BTN_SECONDARY,
  COORD_INPUT_LG,
  COORD_LABEL,
  COORD_SECTION_MUTED,
  COORD_SECTION_TITLE,
  COORD_TEXTAREA,
} from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'
import { formatFechaAR, toInputDate } from '@/lib/date'
import { vencimientoState } from '@/lib/vencimientos'
import type { Activo } from '@/lib/types/inventario'
import {
  categoriasActivo,
  estadosActivo,
  proveedoresMock,
} from './inventarioGestionConstants'

type PutActivoResponse = {
  ok: boolean
  activo: Activo
  error?: string
}

export type EditActivoForm = {
  descripcion: string
  categoria: string
  proveedor: string
  numero_serie: string
  marca: string
  estado: string
  ubicacion: string
  asignado_a: string
  vencimiento: string
  certificado_url: string
  observaciones: string
}

const EMPTY_EDIT_FORM: EditActivoForm = {
  descripcion: '',
  categoria: '',
  proveedor: '',
  numero_serie: '',
  marca: '',
  estado: '',
  ubicacion: '',
  asignado_a: '',
  vencimiento: '',
  certificado_url: '',
  observaciones: '',
}

function inputClass() {
  return `mt-2 ${COORD_INPUT_LG}`
}

function textareaClass() {
  return `mt-2 ${COORD_TEXTAREA}`
}

function normalizeEstado(estado: string | null | undefined): string {
  const raw = String(estado ?? '').trim()
  if (!raw) return 'operativo'
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  const aliases: Record<string, string> = {
    'fuera de servicio': 'fuera_de_servicio',
    'en reparacion': 'en_reparacion',
  }
  return aliases[key] ?? raw
}

function readProveedor(activo: Activo): string {
  return String((activo as Activo & { proveedor?: string | null }).proveedor ?? '').trim()
}

function activoToEditForm(activo: Activo): EditActivoForm {
  return {
    descripcion: activo.descripcion ?? '',
    categoria: activo.categoria ?? '',
    proveedor: readProveedor(activo),
    numero_serie: activo.numero_serie ?? '',
    marca: activo.marca ?? '',
    estado: normalizeEstado(activo.estado),
    ubicacion: activo.ubicacion ?? '',
    asignado_a: activo.asignado_a ?? '',
    vencimiento: toInputDate(activo.vencimiento),
    certificado_url: activo.certificado_url ?? '',
    observaciones: activo.observaciones ?? '',
  }
}

function optionsWithCurrent(base: readonly string[], current: string): string[] {
  const cur = current.trim()
  if (!cur) return [...base]
  if (base.includes(cur)) return [...base]
  return [cur, ...base]
}

function isVencimientoFuturo(vencimiento: string): boolean {
  if (!vencimiento.trim()) return false
  const v = new Date(`${vencimiento}T12:00:00`)
  if (Number.isNaN(v.getTime())) return false
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return v > hoy
}

function displayActivoLabel(a: Activo): string {
  const parts = [a.descripcion, a.numero_serie, a.categoria].filter(Boolean)
  return parts.join(' · ') || a.id
}

function displayActivoNombre(a: Activo): string {
  return a.descripcion?.trim() || a.numero_serie?.trim() || a.id
}

export function ActualizarActivoTab() {
  const formRef = React.useRef<HTMLDivElement>(null)

  const [loadingList, setLoadingList] = React.useState(true)
  const [listError, setListError] = React.useState<string | null>(null)
  const [activos, setActivos] = React.useState<Activo[]>([])

  const [busqueda, setBusqueda] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [editMode, setEditMode] = React.useState(false)
  const [editForm, setEditForm] = React.useState<EditActivoForm>(EMPTY_EDIT_FORM)
  const [certificadoArchivo, setCertificadoArchivo] = React.useState<File | null>(null)

  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = React.useState<string | null>(null)

  const loadActivos = React.useCallback(async () => {
    setLoadingList(true)
    setListError(null)
    try {
      const data = await get<Activo[]>('/activos')
      setActivos(Array.isArray(data) ? data : [])
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
      setActivos([])
    } finally {
      setLoadingList(false)
    }
  }, [])

  React.useEffect(() => {
    void loadActivos()
  }, [loadActivos])

  React.useEffect(() => {
    if (!editMode) return
    const t = window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(t)
  }, [editMode])

  const selectedActivo = React.useMemo(
    () => activos.find((a) => a.id === selectedId) ?? null,
    [activos, selectedId]
  )

  const filteredActivos = React.useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return activos
    return activos.filter((a) => {
      const hay = [
        a.descripcion,
        a.numero_serie,
        a.categoria,
        a.marca,
        a.ubicacion,
        a.asignado_a,
        a.estado,
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
  }, [activos, busqueda])

  const categoriaOptions = React.useMemo(
    () => optionsWithCurrent(categoriasActivo, editForm.categoria),
    [editForm.categoria]
  )

  const estadoOptions = React.useMemo(
    () => optionsWithCurrent(estadosActivo, editForm.estado),
    [editForm.estado]
  )

  const proveedorOptions = React.useMemo(() => {
    const base = proveedoresMock.filter((p) => p !== 'Seleccionar proveedor')
    return optionsWithCurrent(base, editForm.proveedor)
  }, [editForm.proveedor])

  function selectActivo(activo: Activo) {
    setSelectedId(activo.id)
    setEditMode(false)
    setEditForm(EMPTY_EDIT_FORM)
    setCertificadoArchivo(null)
    setSaveError(null)
  }

  function openEditForm() {
    if (!selectedActivo) return
    setEditForm(activoToEditForm(selectedActivo))
    setCertificadoArchivo(null)
    setSaveError(null)
    setSaveSuccess(null)
    setEditMode(true)
  }

  function cancelEdit() {
    setEditMode(false)
    setEditForm(EMPTY_EDIT_FORM)
    setCertificadoArchivo(null)
    setSaveError(null)
  }

  function clearSelection() {
    setSelectedId(null)
    setEditMode(false)
    setEditForm(EMPTY_EDIT_FORM)
    setCertificadoArchivo(null)
    setSaveError(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId || !editMode) {
      setSaveError('Seleccioná un activo y abrí la edición antes de guardar.')
      return
    }
    if (!editForm.descripcion.trim()) {
      setSaveError('La descripción es obligatoria.')
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)

    const appUser = readAppUsuario()
    const usuarioMov =
      appUser?.nombre?.trim() || appUser?.usuario?.trim() || 'Sistema'

    const proveedorValue = editForm.proveedor.trim() || null

    const payload: Record<string, unknown> = {
      descripcion: editForm.descripcion.trim(),
      categoria: editForm.categoria.trim() || null,
      numero_serie: editForm.numero_serie.trim() || null,
      marca: editForm.marca.trim() || null,
      estado: editForm.estado.trim() || 'operativo',
      ubicacion: editForm.ubicacion.trim() || null,
      asignado_a: editForm.asignado_a.trim() || null,
      vencimiento: editForm.vencimiento.trim() || null,
      certificado_url: editForm.certificado_url.trim() || null,
      observaciones: editForm.observaciones.trim() || null,
      usuario: usuarioMov,
      tipo_movimiento: 'actualización de certificación',
      descripcion_movimiento: 'Actualización de certificación',
      observaciones_movimiento: 'Se actualizó vencimiento/certificado del activo',
    }

    if (proveedorValue) {
      payload.proveedor = proveedorValue
    }

    try {
      const data = await put<PutActivoResponse>(
        `/activos/${encodeURIComponent(selectedId)}`,
        payload
      )
      if (!data?.ok || !data.activo) {
        throw new Error(data?.error || 'No se pudo actualizar el activo.')
      }

      await loadActivos()
      setSaveSuccess('Activo actualizado correctamente.')
      setEditMode(false)
      setSelectedId(null)
      setEditForm(EMPTY_EDIT_FORM)
      setCertificadoArchivo(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const vencState = editForm.vencimiento ? vencimientoState(editForm.vencimiento) : null

  return (
    <Card>
      <CardHeader>
        <div>
          <div className={COORD_SECTION_TITLE}>Actualizar activo</div>
          <div className={COORD_SECTION_MUTED}>
            Buscá un activo, seleccionálo en la lista y tocá «Editar activo seleccionado» para
            modificar vencimiento, estado o certificado.
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-6 pt-0">
        {listError ? (
          <InlineMessage kind="error" title="No se pudieron cargar los activos" description={listError} />
        ) : null}

        {saveSuccess ? (
          <InlineMessage kind="success" title="Listo" description={saveSuccess} />
        ) : null}

        {saveError ? (
          <InlineMessage kind="error" title="No se pudo guardar" description={saveError} />
        ) : null}

        <div>
          <label className={COORD_LABEL} htmlFor="buscar-activo">
            Buscar activo
          </label>
          <input
            id="buscar-activo"
            className={cn(inputClass(), 'md:max-w-xl')}
            placeholder="Descripción, serie, categoría, ubicación…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div
          className={cn(
            'flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
            selectedActivo
              ? 'border-sky-500/40 bg-sky-500/10'
              : 'border-slate-700 bg-slate-900/40'
          )}
        >
          <div className="text-sm text-white">
            {selectedActivo ? (
              <>
                <span className="text-slate-300">Activo seleccionado: </span>
                <span className="font-semibold">{displayActivoNombre(selectedActivo)}</span>
              </>
            ) : (
              <span className="text-slate-300">Ningún activo seleccionado</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!selectedActivo}
              onClick={openEditForm}
              className={COORD_BTN_PRIMARY_LG}
            >
              Editar activo seleccionado
            </button>
            {selectedActivo ? (
              <button type="button" onClick={clearSelection} className={COORD_BTN_SECONDARY}>
                Quitar selección
              </button>
            ) : null}
          </div>
        </div>

        {loadingList ? (
          <LoadingState label="Cargando activos…" />
        ) : (
          <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/40">
            {filteredActivos.length === 0 ? (
              <div className="p-4 text-sm text-slate-300">No hay activos que coincidan con la búsqueda.</div>
            ) : (
              <ul className="divide-y divide-slate-700">
                {filteredActivos.map((a) => {
                  const v = vencimientoState(a.vencimiento)
                  const selected = a.id === selectedId
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => selectActivo(a)}
                        className={cn(
                          'flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-slate-800',
                          selected &&
                            'bg-sky-500/15 ring-2 ring-inset ring-sky-400/50'
                        )}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white">{displayActivoLabel(a)}</div>
                          <div className="mt-0.5 text-xs text-slate-300">
                            Estado: {a.estado || '—'} · Ubicación: {a.ubicacion || '—'}
                          </div>
                        </div>
                        <StatusBadge
                          variant={
                            v.state === 'vencido'
                              ? 'danger'
                              : v.state === 'critico' || v.state === 'proximo'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {a.vencimiento ? `Vence ${formatFechaAR(a.vencimiento)}` : 'Sin vencimiento'}
                        </StatusBadge>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {editMode && selectedId ? (
          <div
            ref={formRef}
            className="scroll-mt-6 rounded-2xl border-2 border-sky-500/30 bg-slate-900/50 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.25)]"
          >
            <form key={selectedId} className="space-y-4" onSubmit={handleSave}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-4">
                <div>
                  <div className="text-base font-semibold text-white">Editar activo</div>
                  <div className="mt-1 text-sm text-slate-300">
                    {selectedActivo ? displayActivoNombre(selectedActivo) : ''}
                  </div>
                </div>
                <button type="button" onClick={cancelEdit} className={COORD_BTN_SECONDARY}>
                  Cancelar edición
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={COORD_LABEL} htmlFor="edit-descripcion">
                    Descripción
                  </label>
                  <input
                    id="edit-descripcion"
                    type="text"
                    className={inputClass()}
                    value={editForm.descripcion}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, descripcion: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className={COORD_LABEL} htmlFor="edit-categoria">
                    Categoría
                  </label>
                  <select
                    id="edit-categoria"
                    className={inputClass()}
                    value={editForm.categoria}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, categoria: e.target.value }))
                    }
                  >
                    <option value="">Seleccionar categoría</option>
                    {categoriaOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={COORD_LABEL} htmlFor="edit-proveedor">
                    Proveedor
                  </label>
                  <select
                    id="edit-proveedor"
                    className={inputClass()}
                    value={editForm.proveedor}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, proveedor: e.target.value }))
                    }
                  >
                    <option value="">Seleccionar proveedor</option>
                    {proveedorOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={COORD_LABEL} htmlFor="edit-numero-serie">
                    Número de serie
                  </label>
                  <input
                    id="edit-numero-serie"
                    type="text"
                    className={inputClass()}
                    value={editForm.numero_serie}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, numero_serie: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className={COORD_LABEL} htmlFor="edit-marca">
                    Marca
                  </label>
                  <input
                    id="edit-marca"
                    type="text"
                    className={inputClass()}
                    value={editForm.marca}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, marca: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className={COORD_LABEL} htmlFor="edit-estado">
                    Estado
                  </label>
                  <select
                    id="edit-estado"
                    className={inputClass()}
                    value={editForm.estado}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, estado: e.target.value }))
                    }
                  >
                    {estadoOptions.map((est) => (
                      <option key={est} value={est}>
                        {est.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  {isVencimientoFuturo(editForm.vencimiento) && editForm.estado === 'operativo' ? (
                    <p className="mt-1 text-xs text-slate-300">
                      Vencimiento futuro: el estado puede quedar como operativo.
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className={COORD_LABEL} htmlFor="edit-ubicacion">
                    Ubicación
                  </label>
                  <input
                    id="edit-ubicacion"
                    type="text"
                    className={inputClass()}
                    value={editForm.ubicacion}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, ubicacion: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className={COORD_LABEL} htmlFor="edit-asignado">
                    Asignado a
                  </label>
                  <input
                    id="edit-asignado"
                    type="text"
                    className={inputClass()}
                    value={editForm.asignado_a}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, asignado_a: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className={COORD_LABEL} htmlFor="edit-vencimiento">
                    Fecha de vencimiento
                  </label>
                  <input
                    id="edit-vencimiento"
                    type="date"
                    className={inputClass()}
                    value={editForm.vencimiento}
                    onChange={(e) => {
                      const vencimiento = e.target.value
                      setEditForm((prev) => {
                        const next = { ...prev, vencimiento }
                        if (
                          isVencimientoFuturo(vencimiento) &&
                          (!next.estado || next.estado === 'vencido')
                        ) {
                          next.estado = 'operativo'
                        }
                        return next
                      })
                    }}
                  />
                  {vencState ? (
                    <p className="mt-1 text-xs text-slate-300">
                      Situación actual: {vencState.state}
                      {vencState.days != null ? ` (${vencState.days} días)` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="md:col-span-2">
                  <label className={COORD_LABEL} htmlFor="edit-certificado-url">
                    URL del certificado
                  </label>
                  <input
                    id="edit-certificado-url"
                    type="url"
                    className={inputClass()}
                    value={editForm.certificado_url}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, certificado_url: e.target.value }))
                    }
                    placeholder="https://…"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={COORD_LABEL} htmlFor="edit-certificado-file">
                    Certificado / documentación (archivo)
                  </label>
                  <input
                    id="edit-certificado-file"
                    type="file"
                    accept=".pdf,image/*"
                    className={cn(
                      inputClass(),
                      'cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white'
                    )}
                    onChange={(e) => setCertificadoArchivo(e.target.files?.[0] ?? null)}
                  />
                  <p className="mt-2 text-sm text-slate-300">
                    {certificadoArchivo ? (
                      <span className="font-semibold text-white">{certificadoArchivo.name}</span>
                    ) : (
                      'Opcional. Si subís un archivo, ingresá también la URL pública cuando esté disponible.'
                    )}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className={COORD_LABEL} htmlFor="edit-observaciones">
                    Observaciones
                  </label>
                  <textarea
                    id="edit-observaciones"
                    className={textareaClass()}
                    value={editForm.observaciones}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, observaciones: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-700 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className={COORD_BTN_PRIMARY_LG}
                >
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button type="button" onClick={cancelEdit} className={COORD_BTN_SECONDARY}>
                  Cancelar edición
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
