'use client'

import * as React from 'react'
import Link from 'next/link'
import { GestionInventarioGate } from '@/components/coordinador/inventario/GestionInventarioGate'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/Toast'
import { ApiError, get, patch, post, put } from '@/lib/api'
import { routes } from '@/lib/constants/routes'
import {
  COORD_BTN_LINK,
  COORD_BTN_PRIMARY,
  COORD_BTN_SECONDARY,
  COORD_CHECKBOX,
  COORD_INPUT,
  COORD_LABEL,
  COORD_MODAL,
  COORD_MODAL_FOOTER,
  COORD_MODAL_HEADER,
  COORD_PANEL,
  COORD_SECTION_MUTED,
  COORD_SECTION_TITLE,
} from '@/lib/coordinador/theme'
import { parseContratoItemsExcel } from '@/lib/contratos/parseContratoItemsExcel'
import { formatFechaSoloDia } from '@/lib/date'
import type {
  Contrato,
  ContratoItem,
  ContratoItemMutationResponse,
  ContratoMutationResponse,
  CreateContratoBody,
  CreateContratoItemBody,
  CreateOperadoraBody,
  GetContratoItemsResponse,
  GetContratosResponse,
  GetOperadorasResponse,
  ImportContratoItemPayload,
  ImportContratoItemsResponse,
  Operadora,
  OperadoraMutationResponse,
  PatchContratoEstadoBody,
  PatchContratoItemEstadoBody,
  PatchOperadoraEstadoBody,
  UpdateContratoBody,
  UpdateContratoItemBody,
  UpdateOperadoraBody,
} from '@/lib/types/contratos'
import { cn } from '@/lib/cn'

const BTN_PRIMARY = COORD_BTN_PRIMARY
const BTN_SECONDARY = COORD_BTN_SECONDARY
const LABEL = COORD_LABEL
const INPUT = `${COORD_INPUT} mt-1`
const MODAL = COORD_MODAL
const MODAL_HEADER = COORD_MODAL_HEADER
const MODAL_FOOTER = COORD_MODAL_FOOTER
const CHECKBOX = COORD_CHECKBOX
const FORM_GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2'

type OperadoraForm = { nombre: string; activa: boolean }
type ContratoForm = {
  codigo: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  activo: boolean
  es_default: boolean
}
type ItemForm = {
  codigo: string
  posicion: string
  linea: string
  descripcion: string
  unidad_medida: string
  orden: string
  activo: boolean
}

const EMPTY_OPERADORA: OperadoraForm = { nombre: '', activa: true }
const EMPTY_CONTRATO: ContratoForm = {
  codigo: '',
  nombre: '',
  fecha_inicio: '',
  fecha_fin: '',
  activo: true,
  es_default: false,
}
const EMPTY_ITEM: ItemForm = {
  codigo: '',
  posicion: '',
  linea: '',
  descripcion: '',
  unidad_medida: '',
  orden: '',
  activo: true,
}

/** Orden de prioridad de negocio (nombre_normalizado). El resto va abajo, A–Z. */
const OPERADORA_PRIORIDAD = [
  'ypf',
  'vista energy',
  'chevron',
  'tecpetrol',
  'pampa energia',
  'pluspetrol',
  'prodeng',
] as const

function operadoraSortKey(operadora: Operadora): string {
  return (operadora.nombre_normalizado || operadora.nombre).trim().toLowerCase()
}

function sortOperadorasByPrioridad(list: Operadora[]): Operadora[] {
  const prioridad = OPERADORA_PRIORIDAD as readonly string[]

  return [...list].sort((a, b) => {
    const keyA = operadoraSortKey(a)
    const keyB = operadoraSortKey(b)
    const idxA = prioridad.indexOf(keyA)
    const idxB = prioridad.indexOf(keyB)
    const inA = idxA >= 0
    const inB = idxB >= 0

    if (inA && inB) return idxA - idxB
    if (inA) return -1
    if (inB) return 1
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  })
}

function formatContratoVigencia(contrato: Contrato): string {
  if (!contrato.fecha_inicio && !contrato.fecha_fin) {
    return 'Sin definir'
  }

  const inicio = contrato.fecha_inicio ? formatFechaSoloDia(contrato.fecha_inicio) : '—'
  const fin = contrato.fecha_fin ? formatFechaSoloDia(contrato.fecha_fin) : '—'
  return `${inicio} - ${fin}`
}

function ActivoBadge({ activo }: { activo: boolean }) {
  return activo ? (
    <StatusBadge variant="success">Activo</StatusBadge>
  ) : (
    <StatusBadge variant="danger">Inactivo</StatusBadge>
  )
}

function ColumnPanel({
  title,
  subtitle,
  actionLabel,
  onAction,
  actionDisabled,
  headerActions,
  children,
}: {
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
  actionDisabled?: boolean
  headerActions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={cn(COORD_PANEL, 'flex min-h-[420px] flex-col')}>
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className={COORD_SECTION_TITLE}>{title}</h2>
          {subtitle ? <p className={cn(COORD_SECTION_MUTED, 'mt-1')}>{subtitle}</p> : null}
        </div>
        {headerActions ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">{headerActions}</div>
        ) : actionLabel && onAction ? (
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={onAction}
            disabled={actionDisabled}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">{children}</div>
    </section>
  )
}

function ListPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center text-sm text-slate-300">
      {label}
    </div>
  )
}

export function ContratosGestionClient() {
  return (
    <GestionInventarioGate>
      {({ logout }) => <ContratosGestionAuthed logout={logout} />}
    </GestionInventarioGate>
  )
}

function ContratosGestionAuthed({ logout }: { logout: () => void }) {
  const { push: pushToast } = useToast()

  const [operadoras, setOperadoras] = React.useState<Operadora[]>([])
  const [contratos, setContratos] = React.useState<Contrato[]>([])
  const [items, setItems] = React.useState<ContratoItem[]>([])

  const [selectedOperadoraId, setSelectedOperadoraId] = React.useState<string | null>(null)
  const [selectedContratoId, setSelectedContratoId] = React.useState<string | null>(null)

  const [loadingOperadoras, setLoadingOperadoras] = React.useState(true)
  const [loadingContratos, setLoadingContratos] = React.useState(false)
  const [loadingItems, setLoadingItems] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [operadoraModal, setOperadoraModal] = React.useState<{
    open: boolean
    mode: 'create' | 'edit'
    id: string | null
  }>({ open: false, mode: 'create', id: null })
  const [contratoModal, setContratoModal] = React.useState<{
    open: boolean
    mode: 'create' | 'edit'
    id: string | null
  }>({ open: false, mode: 'create', id: null })
  const [itemModal, setItemModal] = React.useState<{
    open: boolean
    mode: 'create' | 'edit'
    id: string | null
  }>({ open: false, mode: 'create', id: null })

  const [operadoraForm, setOperadoraForm] = React.useState<OperadoraForm>(EMPTY_OPERADORA)
  const [contratoForm, setContratoForm] = React.useState<ContratoForm>(EMPTY_CONTRATO)
  const [itemForm, setItemForm] = React.useState<ItemForm>(EMPTY_ITEM)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [importPreview, setImportPreview] = React.useState<{
    open: boolean
    rows: ImportContratoItemPayload[]
  }>({ open: false, rows: [] })
  const [importing, setImporting] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const selectedOperadora = React.useMemo(
    () => operadoras.find((item) => item.id === selectedOperadoraId) ?? null,
    [operadoras, selectedOperadoraId]
  )

  const operadorasOrdenadas = React.useMemo(
    () => sortOperadorasByPrioridad(operadoras),
    [operadoras]
  )

  const selectedContrato = React.useMemo(
    () => contratos.find((item) => item.id === selectedContratoId) ?? null,
    [contratos, selectedContratoId]
  )

  const loadOperadoras = React.useCallback(async () => {
    setLoadingOperadoras(true)
    setError(null)
    try {
      const data = await get<GetOperadorasResponse>('/operadoras')
      const list = Array.isArray(data.operadoras) ? data.operadoras : []
      const ordenadas = sortOperadorasByPrioridad(list)
      setOperadoras(list)
      setSelectedOperadoraId((prev) => {
        if (prev && list.some((item) => item.id === prev)) return prev
        return ordenadas[0]?.id ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setOperadoras([])
      setSelectedOperadoraId(null)
    } finally {
      setLoadingOperadoras(false)
    }
  }, [])

  const loadContratos = React.useCallback(async (operadoraId: string | null) => {
    if (!operadoraId) {
      setContratos([])
      setSelectedContratoId(null)
      return
    }

    setLoadingContratos(true)
    try {
      const data = await get<GetContratosResponse>(
        `/operadoras/${encodeURIComponent(operadoraId)}/contratos`
      )
      const list = Array.isArray(data.contratos) ? data.contratos : []
      setContratos(list)
      setSelectedContratoId((prev) => {
        if (prev && list.some((item) => item.id === prev)) return prev
        return list[0]?.id ?? null
      })
    } catch (e) {
      pushToast({
        kind: 'error',
        title: e instanceof Error ? e.message : 'No se pudieron cargar los contratos',
      })
      setContratos([])
      setSelectedContratoId(null)
    } finally {
      setLoadingContratos(false)
    }
  }, [pushToast])

  const loadItems = React.useCallback(async (contratoId: string | null) => {
    if (!contratoId) {
      setItems([])
      return
    }

    setLoadingItems(true)
    try {
      const data = await get<GetContratoItemsResponse>(
        `/contratos/${encodeURIComponent(contratoId)}/items`
      )
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      pushToast({
        kind: 'error',
        title: e instanceof Error ? e.message : 'No se pudieron cargar los ítems',
      })
      setItems([])
    } finally {
      setLoadingItems(false)
    }
  }, [pushToast])

  React.useEffect(() => {
    void loadOperadoras()
  }, [loadOperadoras])

  React.useEffect(() => {
    void loadContratos(selectedOperadoraId)
  }, [selectedOperadoraId, loadContratos])

  React.useEffect(() => {
    void loadItems(selectedContratoId)
  }, [selectedContratoId, loadItems])

  function openOperadoraCreate() {
    setOperadoraForm(EMPTY_OPERADORA)
    setFormError(null)
    setOperadoraModal({ open: true, mode: 'create', id: null })
  }

  function openOperadoraEdit(operadora: Operadora) {
    setOperadoraForm({ nombre: operadora.nombre, activa: operadora.activa })
    setFormError(null)
    setOperadoraModal({ open: true, mode: 'edit', id: operadora.id })
  }

  function openContratoCreate() {
    if (!selectedOperadoraId) return
    setContratoForm(EMPTY_CONTRATO)
    setFormError(null)
    setContratoModal({ open: true, mode: 'create', id: null })
  }

  function openContratoEdit(contrato: Contrato) {
    setContratoForm({
      codigo: contrato.codigo ?? '',
      nombre: contrato.nombre,
      fecha_inicio: contrato.fecha_inicio ?? '',
      fecha_fin: contrato.fecha_fin ?? '',
      activo: contrato.activo,
      es_default: contrato.es_default,
    })
    setFormError(null)
    setContratoModal({ open: true, mode: 'edit', id: contrato.id })
  }

  function openItemCreate() {
    if (!selectedContratoId) return
    setItemForm(EMPTY_ITEM)
    setFormError(null)
    setItemModal({ open: true, mode: 'create', id: null })
  }

  function openItemEdit(item: ContratoItem) {
    setItemForm({
      codigo: item.codigo,
      posicion: item.posicion,
      linea: item.linea ?? '',
      descripcion: item.descripcion,
      unidad_medida: item.unidad_medida ?? '',
      orden: item.orden != null ? String(item.orden) : '',
      activo: item.activo,
    })
    setFormError(null)
    setItemModal({ open: true, mode: 'edit', id: item.id })
  }

  async function handleOperadoraSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const nombre = operadoraForm.nombre.trim()
    if (!nombre) {
      setFormError('El nombre es obligatorio.')
      return
    }

    setSaving(true)
    try {
      if (operadoraModal.mode === 'create') {
        const body: CreateOperadoraBody = { nombre, activa: operadoraForm.activa }
        await post<OperadoraMutationResponse>('/operadoras', body)
      } else if (operadoraModal.id) {
        const body: UpdateOperadoraBody = { nombre }
        await put<OperadoraMutationResponse>(
          `/operadoras/${encodeURIComponent(operadoraModal.id)}`,
          body
        )
        if (operadoraForm.activa !== undefined) {
          const estadoBody: PatchOperadoraEstadoBody = { activa: operadoraForm.activa }
          await patch<OperadoraMutationResponse>(
            `/operadoras/${encodeURIComponent(operadoraModal.id)}/estado`,
            estadoBody
          )
        }
      }
      setOperadoraModal({ open: false, mode: 'create', id: null })
      await loadOperadoras()
      pushToast({ kind: 'success', title: 'Operadora guardada correctamente.' })
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'No se pudo guardar la operadora.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleOperadoraActiva(operadora: Operadora) {
    setBusyId(operadora.id)
    try {
      const body: PatchOperadoraEstadoBody = { activa: !operadora.activa }
      await patch<OperadoraMutationResponse>(
        `/operadoras/${encodeURIComponent(operadora.id)}/estado`,
        body
      )
      await loadOperadoras()
    } catch (err) {
      pushToast({
        kind: 'error',
        title:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudo actualizar la operadora.',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleContratoSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedOperadoraId) return
    setFormError(null)

    const nombre = contratoForm.nombre.trim()
    if (!nombre) {
      setFormError('El nombre es obligatorio.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        codigo: contratoForm.codigo.trim() || null,
        nombre,
        fecha_inicio: contratoForm.fecha_inicio || null,
        fecha_fin: contratoForm.fecha_fin || null,
        activo: contratoForm.activo,
        es_default: contratoForm.es_default,
      }

      if (contratoModal.mode === 'create') {
        const body: CreateContratoBody = {
          operadora_id: selectedOperadoraId,
          ...payload,
        }
        await post<ContratoMutationResponse>('/contratos', body)
      } else if (contratoModal.id) {
        const body: UpdateContratoBody = payload
        await put<ContratoMutationResponse>(
          `/contratos/${encodeURIComponent(contratoModal.id)}`,
          body
        )
      }

      setContratoModal({ open: false, mode: 'create', id: null })
      await loadContratos(selectedOperadoraId)
      pushToast({ kind: 'success', title: 'Contrato guardado correctamente.' })
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'No se pudo guardar el contrato.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleContratoActivo(contrato: Contrato) {
    if (!selectedOperadoraId) return
    setBusyId(contrato.id)
    try {
      const body: PatchContratoEstadoBody = { activo: !contrato.activo }
      await patch<ContratoMutationResponse>(
        `/contratos/${encodeURIComponent(contrato.id)}/estado`,
        body
      )
      await loadContratos(selectedOperadoraId)
    } catch (err) {
      pushToast({
        kind: 'error',
        title:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudo actualizar el contrato.',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function marcarContratoDefault(contrato: Contrato) {
    if (!selectedOperadoraId || contrato.es_default) return
    setBusyId(contrato.id)
    try {
      await patch<ContratoMutationResponse>(
        `/contratos/${encodeURIComponent(contrato.id)}/default`,
        {}
      )
      await loadContratos(selectedOperadoraId)
      pushToast({ kind: 'success', title: 'Contrato marcado como default.' })
    } catch (err) {
      pushToast({
        kind: 'error',
        title:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudo marcar el contrato como default.',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleItemSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedContratoId) return
    setFormError(null)

    const codigo = itemForm.codigo.trim()
    const posicion = itemForm.posicion.trim()
    const descripcion = itemForm.descripcion.trim()

    if (!codigo) {
      setFormError('El código es obligatorio.')
      return
    }
    if (!posicion) {
      setFormError('La posición es obligatoria.')
      return
    }
    if (!descripcion) {
      setFormError('La descripción es obligatoria.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        codigo,
        posicion,
        linea: itemForm.linea.trim() || null,
        descripcion,
        tipo_item: 'SERVICIO',
        unidad_medida: itemForm.unidad_medida.trim() || null,
        orden: itemForm.orden.trim() ? Number(itemForm.orden) : null,
        activo: itemForm.activo,
      }

      if (itemModal.mode === 'create') {
        const body: CreateContratoItemBody = {
          contrato_id: selectedContratoId,
          ...payload,
        }
        await post<ContratoItemMutationResponse>('/contrato-items', body)
      } else if (itemModal.id) {
        const body: UpdateContratoItemBody = payload
        await put<ContratoItemMutationResponse>(
          `/contrato-items/${encodeURIComponent(itemModal.id)}`,
          body
        )
      }

      setItemModal({ open: false, mode: 'create', id: null })
      await loadItems(selectedContratoId)
      if (selectedOperadoraId) {
        await loadContratos(selectedOperadoraId)
      }
      pushToast({ kind: 'success', title: 'Ítem guardado correctamente.' })
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'No se pudo guardar el ítem.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleItemActivo(item: ContratoItem) {
    if (!selectedContratoId) return
    setBusyId(item.id)
    try {
      const body: PatchContratoItemEstadoBody = { activo: !item.activo }
      await patch<ContratoItemMutationResponse>(
        `/contrato-items/${encodeURIComponent(item.id)}/estado`,
        body
      )
      await loadItems(selectedContratoId)
    } catch (err) {
      pushToast({
        kind: 'error',
        title:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudo actualizar el ítem.',
      })
    } finally {
      setBusyId(null)
    }
  }

  function openImportPicker() {
    if (!selectedContratoId) {
      pushToast({ kind: 'error', title: 'Seleccioná un contrato antes de importar.' })
      return
    }
    fileInputRef.current?.click()
  }

  async function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'xls') {
      pushToast({ kind: 'error', title: 'Seleccioná un archivo Excel (.xlsx o .xls).' })
      return
    }

    try {
      const buffer = await file.arrayBuffer()
      const rows = parseContratoItemsExcel(buffer)
      setImportPreview({ open: true, rows })
    } catch (err) {
      pushToast({
        kind: 'error',
        title: err instanceof Error ? err.message : 'No se pudo leer el archivo Excel.',
      })
    }
  }

  function closeImportPreview() {
    if (importing) return
    setImportPreview({ open: false, rows: [] })
  }

  async function confirmImportItems() {
    if (!selectedContratoId || importPreview.rows.length === 0) return

    setImporting(true)
    try {
      await post<ImportContratoItemsResponse>(
        `/contratos/${encodeURIComponent(selectedContratoId)}/items/importar`,
        { items: importPreview.rows }
      )
      setImportPreview({ open: false, rows: [] })
      await loadItems(selectedContratoId)
      if (selectedOperadoraId) {
        await loadContratos(selectedOperadoraId)
      }
      pushToast({ kind: 'success', title: 'Ítems importados correctamente' })
    } catch (err) {
      pushToast({
        kind: 'error',
        title:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudieron importar los ítems.',
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestión de contratos"
        subtitle="Operadoras, contratos e ítems certificables por contrato."
        right={
          <>
            <Link href={routes.coordinador.inventario.gestion} className={COORD_BTN_LINK}>
              Volver al panel
            </Link>
            <StatusBadge variant="warning">Acceso restringido</StatusBadge>
            <button type="button" onClick={logout} className={COORD_BTN_LINK}>
              Cerrar sesión
            </button>
          </>
        }
      />

      {error ? (
        <InlineMessage kind="error" title={error} className="w-full border-rose-400/30" />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <ColumnPanel
          title="Operadoras"
          subtitle="Seleccioná una operadora para ver sus contratos."
          actionLabel="Nueva"
          onAction={openOperadoraCreate}
        >
          {loadingOperadoras ? (
            <ListPlaceholder label="Cargando operadoras…" />
          ) : operadorasOrdenadas.length === 0 ? (
            <ListPlaceholder label="Todavía no hay operadoras cargadas." />
          ) : (
            <ul className="space-y-2">
              {operadorasOrdenadas.map((operadora) => {
                const selected = operadora.id === selectedOperadoraId
                return (
                  <li key={operadora.id}>
                    <div
                      className={cn(
                        'rounded-xl border px-3 py-3 transition-colors',
                        selected
                          ? 'border-sky-400/40 bg-sky-500/10'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                      )}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          setSelectedOperadoraId(operadora.id)
                          setSelectedContratoId(null)
                        }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{operadora.nombre}</span>
                          <ActivoBadge activo={operadora.activa} />
                        </div>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={BTN_SECONDARY}
                          onClick={() => openOperadoraEdit(operadora)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={BTN_SECONDARY}
                          disabled={busyId === operadora.id}
                          onClick={() => void toggleOperadoraActiva(operadora)}
                        >
                          {operadora.activa ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </ColumnPanel>

        <ColumnPanel
          title="Contratos"
          subtitle={
            selectedOperadora
              ? `Contratos de ${selectedOperadora.nombre}`
              : 'Seleccioná una operadora primero.'
          }
          actionLabel="Nuevo"
          onAction={openContratoCreate}
          actionDisabled={!selectedOperadoraId}
        >
          {!selectedOperadoraId ? (
            <ListPlaceholder label="Seleccioná una operadora." />
          ) : loadingContratos ? (
            <ListPlaceholder label="Cargando contratos…" />
          ) : contratos.length === 0 ? (
            <ListPlaceholder label="Esta operadora no tiene contratos cargados." />
          ) : (
            <ul className="space-y-2">
              {contratos.map((contrato) => {
                const selected = contrato.id === selectedContratoId
                return (
                  <li key={contrato.id}>
                    <div
                      className={cn(
                        'rounded-xl border px-3 py-3 transition-colors',
                        selected
                          ? 'border-sky-400/40 bg-sky-500/10'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                      )}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setSelectedContratoId(contrato.id)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{contrato.nombre}</span>
                          <ActivoBadge activo={contrato.activo} />
                          {contrato.es_default ? (
                            <StatusBadge variant="accent">Default</StatusBadge>
                          ) : null}
                        </div>
                        <div className="mt-1 space-y-0.5 text-xs text-slate-300">
                          {contrato.codigo ? <div>Código: {contrato.codigo}</div> : null}
                          <div>Vigencia: {formatContratoVigencia(contrato)}</div>
                          <div>Ítems: {contrato.items_count ?? 0}</div>
                        </div>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={BTN_SECONDARY}
                          onClick={() => openContratoEdit(contrato)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={BTN_SECONDARY}
                          disabled={busyId === contrato.id}
                          onClick={() => void toggleContratoActivo(contrato)}
                        >
                          {contrato.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        {!contrato.es_default && contrato.activo ? (
                          <button
                            type="button"
                            className={BTN_PRIMARY}
                            disabled={busyId === contrato.id}
                            onClick={() => void marcarContratoDefault(contrato)}
                          >
                            Marcar default
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </ColumnPanel>

        <ColumnPanel
          title="Ítems del contrato"
          subtitle={
            selectedContrato
              ? `Ítems de ${selectedContrato.nombre}`
              : 'Seleccioná un contrato primero.'
          }
          headerActions={
            <>
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={openImportPicker}
                disabled={!selectedContratoId || importing}
              >
                Importar Excel
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={openItemCreate}
                disabled={!selectedContratoId}
              >
                Nuevo
              </button>
            </>
          }
        >
          {!selectedContratoId ? (
            <ListPlaceholder label="Seleccioná un contrato." />
          ) : loadingItems ? (
            <ListPlaceholder label="Cargando ítems…" />
          ) : items.length === 0 ? (
            <ListPlaceholder label="Este contrato no tiene ítems cargados." />
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {item.codigo} · {item.posicion}
                      </span>
                      <ActivoBadge activo={item.activo} />
                    </div>
                    <p className="mt-1 text-sm text-slate-200">{item.descripcion}</p>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.linea ? `Línea: ${item.linea}` : 'Sin línea'}
                      {item.unidad_medida ? ` · Unidad: ${item.unidad_medida}` : ''}
                      {item.orden != null ? ` · Orden: ${item.orden}` : ''}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={BTN_SECONDARY}
                        onClick={() => openItemEdit(item)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={BTN_SECONDARY}
                        disabled={busyId === item.id}
                        onClick={() => void toggleItemActivo(item)}
                      >
                        {item.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ColumnPanel>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handleImportFileChange}
      />

      <Modal
        open={importPreview.open}
        onClose={closeImportPreview}
        title="Vista previa de importación"
        compact
        maxWidthClassName="max-w-4xl"
        className={MODAL}
        headerClassName={MODAL_HEADER}
        footerClassName={MODAL_FOOTER}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={importing}
              onClick={closeImportPreview}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={importing || importPreview.rows.length === 0}
              onClick={() => void confirmImportItems()}
            >
              {importing ? 'Importando…' : 'Importar ítems'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Se importarán {importPreview.rows.length} ítems al contrato seleccionado. La columna
            precio no se guardará.
          </p>
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-white/10">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.04]">
                  <th className={cn(LABEL, 'px-3 py-2 text-left')}>Código</th>
                  <th className={cn(LABEL, 'px-3 py-2 text-left')}>Posición</th>
                  <th className={cn(LABEL, 'px-3 py-2 text-left')}>Línea</th>
                  <th className={cn(LABEL, 'px-3 py-2 text-left')}>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.rows.map((row, index) => (
                  <tr key={`${row.codigo}-${row.posicion}-${index}`} className="border-b border-white/5">
                    <td className="px-3 py-2 text-white">{row.codigo}</td>
                    <td className="px-3 py-2 text-sky-100">{row.posicion}</td>
                    <td className="px-3 py-2 text-sky-100">{row.linea || '—'}</td>
                    <td className="px-3 py-2 text-slate-200">{row.descripcion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal
        open={operadoraModal.open}
        onClose={() => {
          if (!saving) setOperadoraModal({ open: false, mode: 'create', id: null })
        }}
        title={operadoraModal.mode === 'create' ? 'Nueva operadora' : 'Editar operadora'}
        compact
        maxWidthClassName="max-w-lg"
        className={MODAL}
        headerClassName={MODAL_HEADER}
        footerClassName={MODAL_FOOTER}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={saving}
              onClick={() => setOperadoraModal({ open: false, mode: 'create', id: null })}
            >
              Cancelar
            </button>
            <button type="submit" form="operadora-form" className={BTN_PRIMARY} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        }
      >
        <form id="operadora-form" className="space-y-3" onSubmit={handleOperadoraSubmit}>
          {formError ? <InlineMessage kind="error" title={formError} className="w-full" /> : null}
          <div>
            <label htmlFor="operadora-nombre" className={LABEL}>
              Nombre
            </label>
            <input
              id="operadora-nombre"
              className={INPUT}
              value={operadoraForm.nombre}
              onChange={(e) =>
                setOperadoraForm((prev) => ({ ...prev, nombre: e.target.value }))
              }
              required
              disabled={saving}
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm text-sky-100">
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={operadoraForm.activa}
              onChange={(e) =>
                setOperadoraForm((prev) => ({ ...prev, activa: e.target.checked }))
              }
              disabled={saving}
            />
            <span>Operadora activa</span>
          </label>
        </form>
      </Modal>

      <Modal
        open={contratoModal.open}
        onClose={() => {
          if (!saving) setContratoModal({ open: false, mode: 'create', id: null })
        }}
        title={contratoModal.mode === 'create' ? 'Nuevo contrato' : 'Editar contrato'}
        compact
        maxWidthClassName="max-w-2xl"
        className={MODAL}
        headerClassName={MODAL_HEADER}
        footerClassName={MODAL_FOOTER}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={saving}
              onClick={() => setContratoModal({ open: false, mode: 'create', id: null })}
            >
              Cancelar
            </button>
            <button type="submit" form="contrato-form" className={BTN_PRIMARY} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        }
      >
        <form id="contrato-form" className="space-y-3" onSubmit={handleContratoSubmit}>
          {formError ? <InlineMessage kind="error" title={formError} className="w-full" /> : null}
          <div className={FORM_GRID}>
            <div>
              <label htmlFor="contrato-nombre" className={LABEL}>
                Nombre
              </label>
              <input
                id="contrato-nombre"
                className={INPUT}
                value={contratoForm.nombre}
                onChange={(e) =>
                  setContratoForm((prev) => ({ ...prev, nombre: e.target.value }))
                }
                required
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="contrato-codigo" className={LABEL}>
                Código (opcional)
              </label>
              <input
                id="contrato-codigo"
                className={INPUT}
                value={contratoForm.codigo}
                onChange={(e) =>
                  setContratoForm((prev) => ({ ...prev, codigo: e.target.value }))
                }
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="contrato-inicio" className={LABEL}>
                Fecha inicio
              </label>
              <input
                id="contrato-inicio"
                type="date"
                className={INPUT}
                value={contratoForm.fecha_inicio}
                onChange={(e) =>
                  setContratoForm((prev) => ({ ...prev, fecha_inicio: e.target.value }))
                }
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="contrato-fin" className={LABEL}>
                Fecha fin
              </label>
              <input
                id="contrato-fin"
                type="date"
                className={INPUT}
                value={contratoForm.fecha_fin}
                onChange={(e) =>
                  setContratoForm((prev) => ({ ...prev, fecha_fin: e.target.value }))
                }
                disabled={saving}
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-sky-100">
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={contratoForm.activo}
              onChange={(e) =>
                setContratoForm((prev) => ({
                  ...prev,
                  activo: e.target.checked,
                  es_default: e.target.checked ? prev.es_default : false,
                }))
              }
              disabled={saving}
            />
            <span>Contrato activo</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm text-sky-100">
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={contratoForm.es_default}
              onChange={(e) =>
                setContratoForm((prev) => ({ ...prev, es_default: e.target.checked }))
              }
              disabled={saving || !contratoForm.activo}
            />
            <span>Contrato default de la operadora</span>
          </label>
        </form>
      </Modal>

      <Modal
        open={itemModal.open}
        onClose={() => {
          if (!saving) setItemModal({ open: false, mode: 'create', id: null })
        }}
        title={itemModal.mode === 'create' ? 'Nuevo ítem' : 'Editar ítem'}
        compact
        maxWidthClassName="max-w-2xl"
        className={MODAL}
        headerClassName={MODAL_HEADER}
        footerClassName={MODAL_FOOTER}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={saving}
              onClick={() => setItemModal({ open: false, mode: 'create', id: null })}
            >
              Cancelar
            </button>
            <button type="submit" form="item-form" className={BTN_PRIMARY} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        }
      >
        <form id="item-form" className="space-y-3" onSubmit={handleItemSubmit}>
          {formError ? <InlineMessage kind="error" title={formError} className="w-full" /> : null}
          <div className={FORM_GRID}>
            <div>
              <label htmlFor="item-codigo" className={LABEL}>
                Código
              </label>
              <input
                id="item-codigo"
                className={INPUT}
                value={itemForm.codigo}
                onChange={(e) =>
                  setItemForm((prev) => ({ ...prev, codigo: e.target.value }))
                }
                required
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="item-posicion" className={LABEL}>
                Posición
              </label>
              <input
                id="item-posicion"
                className={INPUT}
                value={itemForm.posicion}
                onChange={(e) =>
                  setItemForm((prev) => ({ ...prev, posicion: e.target.value }))
                }
                required
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="item-linea" className={LABEL}>
                Línea (opcional)
              </label>
              <input
                id="item-linea"
                className={INPUT}
                value={itemForm.linea}
                onChange={(e) => setItemForm((prev) => ({ ...prev, linea: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="item-descripcion" className={LABEL}>
                Descripción
              </label>
              <input
                id="item-descripcion"
                className={INPUT}
                value={itemForm.descripcion}
                onChange={(e) =>
                  setItemForm((prev) => ({ ...prev, descripcion: e.target.value }))
                }
                required
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="item-unidad" className={LABEL}>
                Unidad de medida (opcional)
              </label>
              <input
                id="item-unidad"
                className={INPUT}
                value={itemForm.unidad_medida}
                onChange={(e) =>
                  setItemForm((prev) => ({ ...prev, unidad_medida: e.target.value }))
                }
                disabled={saving}
                placeholder="km, unidad, hora…"
              />
            </div>
            <div>
              <label htmlFor="item-orden" className={LABEL}>
                Orden (opcional)
              </label>
              <input
                id="item-orden"
                type="number"
                className={INPUT}
                value={itemForm.orden}
                onChange={(e) => setItemForm((prev) => ({ ...prev, orden: e.target.value }))}
                disabled={saving}
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-sky-100">
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={itemForm.activo}
              onChange={(e) =>
                setItemForm((prev) => ({ ...prev, activo: e.target.checked }))
              }
              disabled={saving}
            />
            <span>Ítem activo</span>
          </label>
        </form>
      </Modal>
    </div>
  )
}
