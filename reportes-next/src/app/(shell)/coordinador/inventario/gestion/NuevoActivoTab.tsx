'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { ActivoDetalleModal } from '@/components/coordinador/inventario/ActivoDetalleModal'
import { CategoriaSelect } from '@/components/inventario/CategoriaSelect'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineMessage } from '@/components/ui/InlineMessage'
import {
  ACTIVOS_VINCULADOS_TITLE,
  ActivoVinculadoListItem,
  VincularActivoModal,
  VincularActivoTrigger,
  normalizeSerieKey,
} from '@/components/inventario/VincularActivo'
import { ApiError, get, post } from '@/lib/api'
import { readAppUsuario } from '@/lib/auth'
import { cn } from '@/lib/cn'
import {
  COORD_BTN_PRIMARY_LG,
  COORD_BTN_SECONDARY,
  COORD_INPUT_LG,
  COORD_LABEL,
  COORD_SECTION_MUTED,
  COORD_SECTION_TITLE,
  COORD_TEXT,
  COORD_TEXT_MUTED,
  COORD_TEXTAREA,
} from '@/lib/coordinador/theme'
import {
  labelEstadoOperativo,
  normalizeEstadoKey,
} from '@/lib/inventario/labels'
import type {
  Activo,
  PostComponenteResponse,
} from '@/lib/types/inventario'

function inputClass() {
  return `mt-2 ${COORD_INPUT_LG}`
}

function textareaClass() {
  return `mt-2 ${COORD_TEXTAREA}`
}

/** Valores técnicos admitidos por POST /activos (normalizeEstadoOperativo). */
const ESTADOS_OPCIONES: { value: string; label: string }[] = [
  { value: 'operativo', label: 'Operativo' },
  { value: 'fuera de servicio', label: 'Fuera de servicio' },
  { value: 'en reparacion', label: 'En reparación' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'baja', label: 'Baja' },
]

function foldText(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

/** Normaliza un estado existente al value del select (o operativo por defecto). */
function normalizeEstadoForSelect(raw: string | null | undefined): string {
  const folded = foldText(normalizeEstadoKey(raw))
  const match = ESTADOS_OPCIONES.find((o) => foldText(o.value) === folded)
  return match?.value || 'operativo'
}

function usuarioActual(): string {
  const u = readAppUsuario()
  return u?.nombre?.trim() || u?.usuario?.trim() || 'Coordinador'
}

function newRowKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatConjuntoOption(a: Activo): string {
  const serie = a.numero_serie?.trim() || '—'
  const desc = a.descripcion?.trim() || 'Sin descripción'
  return `${serie} — ${desc}`
}

function matchConjuntoQuery(a: Activo, q: string): boolean {
  const needle = foldText(q)
  if (!needle) return true
  const hay = foldText(
    [
      a.numero_serie,
      a.descripcion,
      a.categoria_nombre,
      a.categoria,
      a.marca,
    ]
      .map((x) => String(x || ''))
      .join(' '),
  )
  return hay.includes(needle)
}

function ConjuntoSearchSelect({
  value,
  onChange,
  disabled,
}: {
  value: Activo | null
  onChange: (conjunto: Activo | null) => void
  disabled?: boolean
}) {
  const [conjuntos, setConjuntos] = React.useState<Activo[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await get<Activo[]>('/activos')
        if (cancelled) return
        const list = (Array.isArray(data) ? data : []).filter(
          (a) => a.es_conjunto === true,
        )
        setConjuntos(list)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Error al cargar conjuntos')
        setConjuntos([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = React.useMemo(
    () => conjuntos.filter((a) => matchConjuntoQuery(a, query)),
    [conjuntos, query],
  )

  return (
    <div ref={wrapRef} className="relative">
      {value ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
          <div className="min-w-0 flex-1 text-sm text-white">
            <span className="font-semibold tracking-wide">
              {value.numero_serie || '—'}
            </span>
            <span className={cn('ml-2', COORD_TEXT_MUTED)}>
              {value.descripcion || 'Sin descripción'}
            </span>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
            disabled={disabled}
            title="Cambiar conjunto"
            onClick={() => {
              onChange(null)
              setQuery('')
              setOpen(true)
            }}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <>
          <input
            className={inputClass()}
            value={query}
            disabled={disabled || loading}
            placeholder={
              loading
                ? 'Cargando conjuntos…'
                : 'Buscar por serie, nombre o categoría…'
            }
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
          />
          {open && !loading ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-700 bg-slate-950 py-1 shadow-lg">
              {filtered.length === 0 ? (
                <li className={cn('px-3 py-2 text-sm', COORD_TEXT_MUTED)}>
                  Sin resultados
                </li>
              ) : (
                filtered.map((a) => (
                  <li key={String(a.id)}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-800"
                      onClick={() => {
                        onChange(a)
                        setQuery('')
                        setOpen(false)
                      }}
                    >
                      {formatConjuntoOption(a)}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}
      {error ? <p className="mt-1 text-xs text-rose-400">{error}</p> : null}
    </div>
  )
}

type ConjuntoDraft = {
  descripcion: string
  categoria_id: string
  categoria: string
  numero_serie: string
  vinculos: Activo[]
  pendingSerie: string | null
}

type NuevoActivoForm = {
  categoria_id: string
  categoria: string
  descripcion: string
  numero_serie: string
  marca: string
  estado: string
  ubicacion: string
  asignado_a: string
  vencimiento: string
  dias_aviso: string
  observaciones: string
}

const EMPTY_ACTIVO: NuevoActivoForm = {
  categoria_id: '',
  categoria: '',
  descripcion: '',
  numero_serie: '',
  marca: '',
  estado: 'operativo',
  ubicacion: '',
  asignado_a: '',
  vencimiento: '',
  dias_aviso: '',
  observaciones: '',
}

export function NuevoActivoTab({
  onPreview,
}: {
  onPreview: (values: Record<string, string>) => void
}) {
  const [esNuevoConjunto, setEsNuevoConjunto] = React.useState(false)
  const [form, setForm] = React.useState<NuevoActivoForm>(EMPTY_ACTIVO)
  const [estaEnConjunto, setEstaEnConjunto] = React.useState(false)
  const [conjuntoDestino, setConjuntoDestino] = React.useState<Activo | null>(null)
  const [certificadoArchivo, setCertificadoArchivo] = React.useState<File | null>(
    null,
  )
  const [msg, setMsg] = React.useState<string | null>(null)
  const [msgKind, setMsgKind] = React.useState<'warning' | 'error' | 'success'>(
    'warning',
  )
  const [saving, setSaving] = React.useState(false)

  const [conjuntoDesc, setConjuntoDesc] = React.useState('')
  const [conjuntoCatId, setConjuntoCatId] = React.useState('')
  const [conjuntoCatNombre, setConjuntoCatNombre] = React.useState('')
  const [conjuntoSerie, setConjuntoSerie] = React.useState('')
  const [vinculos, setVinculos] = React.useState<Activo[]>([])
  const [vincularOpen, setVincularOpen] = React.useState(false)

  const draftRef = React.useRef<ConjuntoDraft | null>(null)
  const returnAfterSaveRef = React.useRef(false)

  const [detalleId, setDetalleId] = React.useState<string | null>(null)
  const [detalleInitial, setDetalleInitial] = React.useState<Activo | null>(null)

  const [relevarOpen, setRelevarOpen] = React.useState(false)
  const [relevarSerie, setRelevarSerie] = React.useState('')

  function showMsg(text: string, kind: 'warning' | 'error' | 'success' = 'warning') {
    setMsg(text)
    setMsgKind(kind)
  }

  function snapshotConjuntoDraft(pendingSerie: string | null): ConjuntoDraft {
    return {
      descripcion: conjuntoDesc,
      categoria_id: conjuntoCatId,
      categoria: conjuntoCatNombre,
      numero_serie: conjuntoSerie,
      vinculos: vinculos.map((v) => ({ ...v })),
      pendingSerie,
    }
  }

  function restoreConjuntoDraft(draft: ConjuntoDraft) {
    setConjuntoDesc(draft.descripcion)
    setConjuntoCatId(draft.categoria_id)
    setConjuntoCatNombre(draft.categoria)
    setConjuntoSerie(draft.numero_serie)
    setVinculos(draft.vinculos.map((v) => ({ ...v })))
    setEsNuevoConjunto(true)
  }

  function toggleNuevoConjunto(checked: boolean) {
    setMsg(null)
    if (checked) {
      if (!draftRef.current) {
        setVinculos([])
      }
      // Un conjunto no se vincula a sí mismo como componente.
      setEstaEnConjunto(false)
      setConjuntoDestino(null)
      setEsNuevoConjunto(true)
      return
    }
    if (!returnAfterSaveRef.current) {
      draftRef.current = null
    }
    setEsNuevoConjunto(false)
  }

  function toggleEstaEnConjunto(checked: boolean) {
    setMsg(null)
    setEstaEnConjunto(checked)
    if (!checked) {
      setConjuntoDestino(null)
    } else {
      setForm((s) => ({ ...s, ubicacion: '' }))
    }
  }

  function iniciarRelevarActivo() {
    const serie = relevarSerie
    draftRef.current = snapshotConjuntoDraft(serie)
    returnAfterSaveRef.current = true
    setRelevarOpen(false)
    setEsNuevoConjunto(false)
    setEstaEnConjunto(false)
    setConjuntoDestino(null)
    setForm({
      ...EMPTY_ACTIVO,
      numero_serie: serie,
      estado: 'operativo',
    })
    setCertificadoArchivo(null)
    showMsg(
      `Completá el relevamiento del activo ${serie}. Al guardarlo, volverás al conjunto en edición.`,
      'warning',
    )
  }

  async function guardarActivoIndividual(): Promise<Activo | null> {
    if (!form.descripcion.trim()) {
      showMsg('La descripción es obligatoria.', 'error')
      return null
    }
    if (!form.numero_serie.trim()) {
      showMsg('El número de serie es obligatorio.', 'error')
      return null
    }
    if (!form.categoria_id) {
      showMsg('Seleccioná una categoría aplicable a activos.', 'error')
      return null
    }
    const estado = normalizeEstadoForSelect(form.estado)
    if (!ESTADOS_OPCIONES.some((o) => o.value === estado)) {
      showMsg('Seleccioná un estado válido.', 'error')
      return null
    }
    if (estaEnConjunto && !conjuntoDestino) {
      showMsg('Seleccioná el conjunto al que pertenece el activo.', 'error')
      return null
    }

    setSaving(true)
    setMsg(null)
    try {
      const data = await post<{ ok: boolean; activo?: Activo; error?: string }>(
        '/activos',
        {
          descripcion: form.descripcion.trim(),
          numero_serie: form.numero_serie.trim(),
          categoria_id: form.categoria_id,
          estado,
          marca: form.marca.trim() || null,
          ubicacion: estaEnConjunto ? null : form.ubicacion.trim() || null,
          asignado_a: form.asignado_a.trim() || null,
          vencimiento: form.vencimiento.trim() || null,
          dias_aviso: form.dias_aviso.trim()
            ? Number(form.dias_aviso)
            : undefined,
          observaciones: form.observaciones.trim() || null,
          es_conjunto: false,
          usuario: usuarioActual(),
          client_uuid: newRowKey(),
        },
      )
      if (!data?.ok || !data.activo) {
        throw new Error(data?.error || 'No se pudo crear el activo')
      }
      return data.activo
    } catch (e) {
      showMsg(e instanceof Error ? e.message : String(e), 'error')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function vincularAlConjunto(
    activoCreado: Activo,
    conjunto: Activo,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await post<PostComponenteResponse>(
        `/activos/${encodeURIComponent(String(conjunto.id))}/componentes`,
        {
          componente_id: activoCreado.id,
          client_uuid: newRowKey(),
          usuario: usuarioActual(),
        },
      )
      return { ok: true }
    } catch (e) {
      let reason = e instanceof Error ? e.message : String(e)
      if (e instanceof ApiError && e.status === 409) {
        const details = e.details as PostComponenteResponse | undefined
        if (details?.code === 'COMPONENTE_EN_OTRO_CONJUNTO') {
          reason = `ya pertenece a otro conjunto`
        }
      }
      return {
        ok: false,
        message: `El activo fue creado, pero no pudo vincularse al conjunto seleccionado. ${reason}`,
      }
    }
  }

  async function onGuardarActivo() {
    const destino = estaEnConjunto ? conjuntoDestino : null
    const creado = await guardarActivoIndividual()
    if (!creado) return

    if (destino) {
      setSaving(true)
      const link = await vincularAlConjunto(creado, destino)
      setSaving(false)
      if (!link.ok) {
        showMsg(link.message, 'error')
        return
      }
    }

    if (returnAfterSaveRef.current && draftRef.current) {
      const draft = draftRef.current
      const pendingSerie = normalizeSerieKey(
        draft.pendingSerie || creado.numero_serie || '',
      )

      let nextVinculos = draft.vinculos.map((v) => ({ ...v }))
      const foundIdx = nextVinculos.findIndex(
        (v) => normalizeSerieKey(v.numero_serie || '') === pendingSerie,
      )
      if (foundIdx >= 0) {
        nextVinculos[foundIdx] = creado
      } else {
        nextVinculos = [...nextVinculos, creado]
      }

      draftRef.current = null
      returnAfterSaveRef.current = false
      restoreConjuntoDraft({
        ...draft,
        vinculos: nextVinculos,
        pendingSerie: null,
      })
      setForm(EMPTY_ACTIVO)
      setEstaEnConjunto(false)
      setConjuntoDestino(null)
      setCertificadoArchivo(null)
      showMsg(
        `Activo ${creado.numero_serie || pendingSerie} guardado y agregado al conjunto.`,
        'success',
      )
      return
    }

    setForm(EMPTY_ACTIVO)
    setEstaEnConjunto(false)
    setConjuntoDestino(null)
    setCertificadoArchivo(null)
    showMsg(
      destino
        ? `Activo ${creado.numero_serie || ''} guardado y vinculado a ${destino.numero_serie || 'conjunto'}.`
        : `Activo ${creado.numero_serie || ''} guardado correctamente.`,
      'success',
    )
  }

  async function onGuardarConjunto() {
    if (!conjuntoDesc.trim()) {
      showMsg('El nombre o descripción del conjunto es obligatorio.', 'error')
      return
    }
    if (!conjuntoSerie.trim()) {
      showMsg('El número de serie del conjunto es obligatorio.', 'error')
      return
    }
    if (!conjuntoCatId) {
      showMsg('Seleccioná una categoría aplicable a conjuntos.', 'error')
      return
    }

    const ids = new Set<string>()
    for (const act of vinculos) {
      const id = String(act.id)
      if (ids.has(id)) {
        showMsg(
          `El activo ${act.numero_serie} está duplicado en la lista.`,
          'error',
        )
        return
      }
      ids.add(id)
    }

    setSaving(true)
    setMsg(null)
    try {
      const created = await post<{ ok: boolean; activo?: Activo; error?: string }>(
        '/activos',
        {
          descripcion: conjuntoDesc.trim(),
          numero_serie: conjuntoSerie.trim(),
          categoria_id: conjuntoCatId,
          estado: 'operativo',
          es_conjunto: true,
          usuario: usuarioActual(),
          client_uuid: newRowKey(),
        },
      )
      if (!created?.ok || !created.activo) {
        throw new Error(created?.error || 'No se pudo crear el conjunto')
      }

      const conjuntoId = created.activo.id
      const fallos: string[] = []

      for (const act of vinculos) {
        try {
          await post<PostComponenteResponse>(
            `/activos/${encodeURIComponent(String(conjuntoId))}/componentes`,
            {
              componente_id: act.id,
              client_uuid: newRowKey(),
              usuario: usuarioActual(),
            },
          )
        } catch (e) {
          let reason = e instanceof Error ? e.message : String(e)
          if (e instanceof ApiError && e.status === 409) {
            const details = e.details as PostComponenteResponse | undefined
            if (details?.code === 'COMPONENTE_EN_OTRO_CONJUNTO') {
              reason = `ya pertenece a otro conjunto (id ${details.conjunto_id_actual ?? '—'})`
            }
          }
          fallos.push(`${act.numero_serie || act.id}: ${reason}`)
        }
      }

      if (fallos.length > 0) {
        showMsg(
          `Conjunto ${created.activo.numero_serie} creado, pero falló la vinculación de: ${fallos.join(' · ')}`,
          'error',
        )
      } else {
        showMsg(
          `Conjunto ${created.activo.numero_serie} guardado${
            vinculos.length
              ? ` con ${vinculos.length} activo(s) vinculado(s)`
              : ''
          }.`,
          'success',
        )
        setConjuntoDesc('')
        setConjuntoCatId('')
        setConjuntoCatNombre('')
        setConjuntoSerie('')
        setVinculos([])
        draftRef.current = null
      }
    } catch (e) {
      showMsg(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  function previewIndividual() {
    if (!form.categoria_id) {
      showMsg('Seleccioná una categoría compatible.', 'warning')
      return
    }
    if (estaEnConjunto && !conjuntoDestino) {
      showMsg('Seleccioná el conjunto al que pertenece el activo.', 'warning')
      return
    }
    const estado = normalizeEstadoForSelect(form.estado)
    onPreview({
      Descripción: form.descripcion,
      'Tipo de activo': 'Individual',
      Categoría: form.categoria,
      'Número de serie': form.numero_serie,
      Marca: form.marca,
      Estado: labelEstadoOperativo(estado),
      ...(estaEnConjunto
        ? {
            Conjunto: conjuntoDestino
              ? formatConjuntoOption(conjuntoDestino)
              : '',
          }
        : { Ubicación: form.ubicacion }),
      'Asignado a': form.asignado_a,
      Vencimiento: form.vencimiento,
      'Días de aviso': form.dias_aviso,
      ...(certificadoArchivo
        ? { 'Certificado / documentación': certificadoArchivo.name }
        : {}),
      Observaciones: form.observaciones,
    })
  }

  return (
    <>
      <div>
        <div className={COORD_SECTION_TITLE}>Nuevo activo</div>
        <label
          className={cn(
            'mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-medium',
            COORD_TEXT_MUTED,
          )}
        >
          <input
            type="checkbox"
            className="size-3.5 rounded border-slate-600 bg-slate-900"
            checked={esNuevoConjunto}
            disabled={saving}
            onChange={(e) => toggleNuevoConjunto(e.target.checked)}
          />
          Nuevo conjunto
        </label>
        <div className={cn('mt-1', COORD_SECTION_MUTED)}>
          {esNuevoConjunto
            ? 'Alta de conjunto con vínculo opcional a activos existentes.'
            : 'Completá los datos del equipo para registrarlo en inventario.'}
        </div>
      </div>

      {msg ? (
        <InlineMessage
          kind={msgKind === 'success' ? 'success' : msgKind === 'error' ? 'error' : 'warning'}
          title={msg}
          className="mt-4"
        />
      ) : null}

      {esNuevoConjunto ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={COORD_LABEL}>Nombre o descripción del conjunto</label>
              <input
                className={inputClass()}
                value={conjuntoDesc}
                disabled={saving}
                onChange={(e) => setConjuntoDesc(e.target.value)}
                placeholder='Ej. Manifold 3 1/16" 15K'
              />
            </div>
            <div>
              <label className={COORD_LABEL}>Categoría</label>
              <CategoriaSelect
                className={inputClass()}
                value={conjuntoCatId}
                aplicable="conjuntos"
                disabled={saving}
                emptyLabel="Seleccionar categoría"
                onChange={(id, cat) => {
                  setConjuntoCatId(id)
                  setConjuntoCatNombre(cat?.nombre || '')
                }}
              />
            </div>
            <div>
              <label className={COORD_LABEL}>
                Número de serie o identificación del conjunto
              </label>
              <input
                className={inputClass()}
                value={conjuntoSerie}
                disabled={saving}
                onChange={(e) => setConjuntoSerie(e.target.value)}
                placeholder="Ej. MF-001"
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <VincularActivoTrigger
              onClick={() => setVincularOpen(true)}
              disabled={saving}
            />
            <div className={COORD_LABEL}>{ACTIVOS_VINCULADOS_TITLE}</div>
            {vinculos.length === 0 ? (
              <p className={cn('text-xs', COORD_TEXT_MUTED)}>
                Opcional. Agregá activos existentes por número de serie.
              </p>
            ) : (
              <ul className="space-y-2">
                {vinculos.map((act) => (
                  <ActivoVinculadoListItem
                    key={String(act.id)}
                    activo={act}
                    disabled={saving}
                    onOpenDetalle={(a) => {
                      setDetalleInitial(a)
                      setDetalleId(String(a.id))
                    }}
                    onRemove={() =>
                      setVinculos((rows) =>
                        rows.filter((v) => String(v.id) !== String(act.id)),
                      )
                    }
                  />
                ))}
              </ul>
            )}
            <VincularActivoModal
              open={vincularOpen}
              mode="deferred"
              conjuntoSerie={conjuntoSerie}
              excludeActivoIds={vinculos.map((v) => v.id)}
              excludeSeries={vinculos.map((v) => v.numero_serie || '')}
              onClose={() => setVincularOpen(false)}
              onLinked={(activo) => setVinculos((rows) => [...rows, activo])}
              onNotFound={(serie) => {
                setRelevarSerie(serie)
                setRelevarOpen(true)
              }}
              onOpenDetalle={(a) => {
                setDetalleInitial(a)
                setDetalleId(String(a.id))
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className={COORD_BTN_PRIMARY_LG}
              disabled={saving}
              onClick={() => void onGuardarConjunto()}
            >
              {saving ? 'Guardando…' : 'Guardar conjunto'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={COORD_LABEL}>Descripción</label>
              <input
                className={inputClass()}
                value={form.descripcion}
                disabled={saving}
                onChange={(e) =>
                  setForm((s) => ({ ...s, descripcion: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={COORD_LABEL}>Categoría</label>
              <CategoriaSelect
                className={inputClass()}
                value={form.categoria_id}
                aplicable="activos"
                disabled={saving}
                emptyLabel="Seleccionar categoría"
                onChange={(id, cat) => {
                  setMsg(null)
                  setForm((s) => ({
                    ...s,
                    categoria_id: id,
                    categoria: cat?.nombre || '',
                  }))
                }}
              />
            </div>
            <div>
              <label className={COORD_LABEL}>Número de serie</label>
              <input
                className={inputClass()}
                value={form.numero_serie}
                disabled={saving}
                onChange={(e) =>
                  setForm((s) => ({ ...s, numero_serie: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={COORD_LABEL}>Marca</label>
              <input
                className={inputClass()}
                value={form.marca}
                disabled={saving}
                onChange={(e) => setForm((s) => ({ ...s, marca: e.target.value }))}
              />
            </div>
            <div>
              <label className={COORD_LABEL}>Estado</label>
              <select
                className={inputClass()}
                value={normalizeEstadoForSelect(form.estado)}
                disabled={saving}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    estado: normalizeEstadoForSelect(e.target.value),
                  }))
                }
              >
                {ESTADOS_OPCIONES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label
                className={cn(
                  'mb-1 inline-flex cursor-pointer items-center gap-2 text-xs font-medium',
                  COORD_TEXT_MUTED,
                )}
              >
                <input
                  type="checkbox"
                  className="size-3.5 rounded border-slate-600 bg-slate-900"
                  checked={estaEnConjunto}
                  disabled={saving}
                  onChange={(e) => toggleEstaEnConjunto(e.target.checked)}
                />
                ¿Está en un conjunto?
              </label>
              {estaEnConjunto ? (
                <>
                  <label className={COORD_LABEL}>Conjunto</label>
                  <ConjuntoSearchSelect
                    value={conjuntoDestino}
                    disabled={saving}
                    onChange={setConjuntoDestino}
                  />
                </>
              ) : (
                <>
                  <label className={COORD_LABEL}>Ubicación</label>
                  <input
                    className={inputClass()}
                    value={form.ubicacion}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, ubicacion: e.target.value }))
                    }
                    placeholder="Depósito, base, yacimiento…"
                  />
                </>
              )}
            </div>
            <div>
              <label className={COORD_LABEL}>Asignado a</label>
              <input
                className={inputClass()}
                value={form.asignado_a}
                disabled={saving}
                onChange={(e) =>
                  setForm((s) => ({ ...s, asignado_a: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={COORD_LABEL}>Vencimiento</label>
              <input
                type="date"
                className={inputClass()}
                value={form.vencimiento}
                disabled={saving}
                onChange={(e) =>
                  setForm((s) => ({ ...s, vencimiento: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={COORD_LABEL}>Días de aviso</label>
              <input
                className={inputClass()}
                inputMode="numeric"
                value={form.dias_aviso}
                disabled={saving}
                onChange={(e) =>
                  setForm((s) => ({ ...s, dias_aviso: e.target.value }))
                }
                placeholder="Antes del vencimiento"
              />
            </div>
            <div className="md:col-span-2">
              <label className={COORD_LABEL}>Certificado / documentación</label>
              <input
                type="file"
                accept=".pdf,image/*"
                disabled={saving}
                className={cn(
                  inputClass(),
                  'cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white',
                )}
                onChange={(e) =>
                  setCertificadoArchivo(e.target.files?.[0] ?? null)
                }
              />
              <p className={COORD_SECTION_MUTED}>
                {certificadoArchivo ? (
                  <span className={cn('font-semibold', COORD_TEXT)}>
                    {certificadoArchivo.name}
                  </span>
                ) : (
                  'Ningún archivo seleccionado.'
                )}
              </p>
            </div>
            <div className="md:col-span-2">
              <label className={COORD_LABEL}>Observaciones</label>
              <textarea
                className={textareaClass()}
                value={form.observaciones}
                disabled={saving}
                onChange={(e) =>
                  setForm((s) => ({ ...s, observaciones: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={previewIndividual}
              className={COORD_BTN_SECONDARY}
              disabled={saving}
            >
              Vista previa
            </button>
            <button
              type="button"
              onClick={() => void onGuardarActivo()}
              className={COORD_BTN_PRIMARY_LG}
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar activo'}
            </button>
          </div>
        </div>
      )}

      <ActivoDetalleModal
        open={Boolean(detalleId)}
        activoId={detalleId}
        initialActivo={detalleInitial}
        onClose={() => {
          setDetalleId(null)
          setDetalleInitial(null)
        }}
        onSelectActivoId={(id) => setDetalleId(id)}
      />

      <ConfirmDialog
        open={relevarOpen}
        title="Activo no encontrado"
        description={`No se encontró un activo con el número de serie ${relevarSerie}. ¿Desea relevarlo ahora?`}
        confirmLabel="Sí, relevar activo"
        cancelLabel="Cancelar"
        onCancel={() => setRelevarOpen(false)}
        onConfirm={() => {
          iniciarRelevarActivo()
        }}
      />
    </>
  )
}
