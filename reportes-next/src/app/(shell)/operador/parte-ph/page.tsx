'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { get, post } from '@/lib/api'
import type { Activo } from '@/lib/types/inventario'
import type { GetActivosOperadorResponse } from '@/lib/types/operador'
import { fileToBase64Pure } from '@/lib/file'
import {
  parsePlainOrDisplayDateToLocalDate,
  toBackendDate,
  toDisplayDate,
  toInputDate,
} from '@/lib/date'
import { normalizeUserError } from '@/lib/user-errors'
import {
  hasParteOperativoPrefill,
  parsePartePhPrefillFromSearchParams,
  partePhFormFieldsFromPrefill,
  type PartePhPrefill,
} from '@/lib/parte-ph-prefill'
import { vencimientoLabel } from '@/lib/status'
import { vencimientoState } from '@/lib/vencimientos'

/** Vencimiento del activo (ISO o dd/mm desde API); no confundir con `f.fecha` del parte. */
function estaVencidoActivo(vencimientoDesdeApi: string | null | undefined): boolean {
  if (!vencimientoDesdeApi) return false
  const parsed = parsePlainOrDisplayDateToLocalDate(vencimientoDesdeApi)
  if (!parsed) return false
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const v = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  v.setHours(0, 0, 0, 0)
  return v < hoy
}

function recalcularCaidas(presion_estabilizada: string, presion_final: string) {
  const pe = parseFloat(presion_estabilizada) || 0
  const pf = parseFloat(presion_final) || 0
  if (!pe && !pf) return { caida_presion: '', porcentaje_caida: '' }
  const caida = pe - pf
  const porcentaje = pe > 0 ? (caida / pe) * 100 : 0
  return {
    caida_presion: String(Math.round(caida)),
    porcentaje_caida: porcentaje.toFixed(2),
  }
}

function recalcularNegativa(
  presion_entrampada: string,
  presion_testigo_inicial: string,
  presion_testigo_final: string
) {
  const pe = parseFloat(presion_entrampada) || 0
  const pti = parseFloat(presion_testigo_inicial) || 0
  const ptf = parseFloat(presion_testigo_final) || 0
  if (!pe && !pti && !ptf) {
    return { incremento_presion: '', porcentaje_perdida_negativa: '' }
  }
  const incremento = ptf - pti
  const porcentaje = pe > 0 ? (incremento / pe) * 100 : 0
  return {
    incremento_presion: String(Math.round(incremento)),
    porcentaje_perdida_negativa: porcentaje.toFixed(2),
  }
}

const DEFAULT_FLUIDO_UTILIZADO = 'Agua limpia'
const DEFAULT_EQUIPO_SERVICIO = 'Sin equipo'

const inputClass =
  'h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:ring-4 focus:ring-black/5 dark:focus:ring-white/10 disabled:opacity-60'
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted'
const textareaClass =
  'min-h-[100px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-black/5 dark:focus:ring-white/10 disabled:opacity-60'

function pickField(loaded: string | null | undefined, fallback: string): string {
  const trimmed = (loaded ?? '').trim()
  return trimmed || fallback
}

type GuardarParteResponse = {
  ok?: boolean
  error?: string
  parte_id?: string
  parte?: { id?: string }
}

type PartePhFormValues = ReturnType<typeof createEmptyFormValues>

function createEmptyFormValues() {
  return {
    reporte_numero: '',
    fecha: '',
    cliente: '',
    equipo_general: DEFAULT_EQUIPO_SERVICIO,
    yacimiento: '',
    pozo: '',
    tipo_prueba: 'positiva' as 'positiva' | 'negativa',
    presion_ensayo: '',
    tiempo_ensayo: '',
    fluido_utilizado: DEFAULT_FLUIDO_UTILIZADO,
    resultado_ensayo: '',
    presion_estabilizada: '',
    hs_estabilizada: '',
    presion_final: '',
    hs_final: '',
    presion_entrampada: '',
    presion_testigo_inicial: '',
    hs_inicial_negativa: '',
    presion_testigo_final: '',
    hs_final_negativa: '',
    observaciones: '',
    elemento_ensayar: '',
    marca: '',
    modelo: '',
    numero_serie_elemento: '',
    numero_parte: '',
    numero_presinto: '',
    detalle_ensayo: '',
    supervisor_operativo: '',
    operador_lider: '',
    operador: '',
    ayudante: '',
  }
}

function initialFormValues(
  prefill?: ReturnType<typeof partePhFormFieldsFromPrefill>,
  existing?: Partial<PartePhFormValues>
): PartePhFormValues {
  const base = createEmptyFormValues()
  return {
    ...base,
    reporte_numero: pickField(prefill?.reporte_numero ?? existing?.reporte_numero, base.reporte_numero),
    fecha: pickField(prefill?.fecha ?? existing?.fecha, base.fecha),
    cliente: pickField(prefill?.cliente ?? existing?.cliente, base.cliente),
    yacimiento: pickField(prefill?.yacimiento ?? existing?.yacimiento, base.yacimiento),
    pozo: pickField(prefill?.pozo ?? existing?.pozo, base.pozo),
    fluido_utilizado: pickField(existing?.fluido_utilizado, base.fluido_utilizado),
    equipo_general: pickField(existing?.equipo_general, base.equipo_general),
  }
}

/** Tras guardar: vacío completo, o datos generales del parte operativo + defaults. */
function getFormStateAfterSave(
  isFromParteOperativo: boolean,
  prefill: PartePhPrefill
): PartePhFormValues {
  if (!isFromParteOperativo) {
    return initialFormValues()
  }
  return initialFormValues(partePhFormFieldsFromPrefill(prefill))
}

export default function OperadorPartePhPage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando formulario PH…" />}>
      <OperadorPartePhPageContent />
    </Suspense>
  )
}

function OperadorPartePhPageContent() {
  const searchParams = useSearchParams()
  const prefillFromUrl = React.useMemo(
    () => parsePartePhPrefillFromSearchParams(searchParams),
    [searchParams]
  )
  const isFromParteOperativo = Boolean(searchParams.get('parte_operativo_id')?.trim())
  const hasPrefillFromParteOperativo = hasParteOperativoPrefill(prefillFromUrl)

  const [loadingEquipos, setLoadingEquipos] = React.useState(true)
  const [equiposError, setEquiposError] = React.useState<string | null>(null)
  const [unidades, setUnidades] = React.useState<Activo[]>([])
  const [wikas, setWikas] = React.useState<Activo[]>([])

  const [unidadId, setUnidadId] = React.useState('')
  const [wikaId, setWikaId] = React.useState('')

  const [f, setF] = React.useState(() =>
    hasPrefillFromParteOperativo
      ? initialFormValues(partePhFormFieldsFromPrefill(prefillFromUrl))
      : initialFormValues()
  )

  const [foto1, setFoto1] = React.useState<File | null>(null)
  const [foto2, setFoto2] = React.useState<File | null>(null)
  const [preview1, setPreview1] = React.useState<string | null>(null)
  const [preview2, setPreview2] = React.useState<string | null>(null)

  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [formSuccess, setFormSuccess] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoadingEquipos(true)
        setEquiposError(null)
        const data = await get<GetActivosOperadorResponse>('/activos-operador')
        if (cancelled) return
        setUnidades(data.unidades || [])
        setWikas(data.wikas || [])
      } catch (e) {
        if (cancelled) return
        setEquiposError(
          normalizeUserError(e) ??
            'No se pudieron cargar unidades y WIKAs.'
        )
      } finally {
        if (!cancelled) setLoadingEquipos(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    return () => {
      if (preview1) URL.revokeObjectURL(preview1)
      if (preview2) URL.revokeObjectURL(preview2)
    }
  }, [preview1, preview2])

  const selectedUnidad = React.useMemo(
    () => unidades.find((u) => String(u.id) === String(unidadId)) || null,
    [unidades, unidadId]
  )
  const selectedWika = React.useMemo(
    () => wikas.find((w) => String(w.id) === String(wikaId)) || null,
    [wikas, wikaId]
  )

  const numeroSerieUnidad = selectedUnidad?.numero_serie || ''
  /** Solo lectura: viene de GET /activos-operador (igual que legacy readonly). Nunca type="date". */
  /** Solo UI (dd/mm/aaaa); el payload usa `toBackendDate` aparte. */
  const vencimientoUnidadDisplay = toDisplayDate(selectedUnidad?.vencimiento || '')
  const numeroSerieWika = selectedWika?.numero_serie || ''
  const vencimientoWikaDisplay = toDisplayDate(selectedWika?.vencimiento || '')

  const unidadVencida = selectedUnidad
    ? estaVencidoActivo(selectedUnidad.vencimiento)
    : false
  const wikaVencida = selectedWika ? estaVencidoActivo(selectedWika.vencimiento) : false

  const { caida_presion, porcentaje_caida } = React.useMemo(
    () => recalcularCaidas(f.presion_estabilizada, f.presion_final),
    [f.presion_estabilizada, f.presion_final]
  )

  const { incremento_presion, porcentaje_perdida_negativa } = React.useMemo(
    () =>
      recalcularNegativa(
        f.presion_entrampada,
        f.presion_testigo_inicial,
        f.presion_testigo_final
      ),
    [f.presion_entrampada, f.presion_testigo_inicial, f.presion_testigo_final]
  )

  function setField<K extends keyof typeof f>(key: K, value: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [key]: value }))
  }

  function handleFoto1(file: File | null) {
    if (preview1) URL.revokeObjectURL(preview1)
    setFoto1(file)
    setPreview1(file ? URL.createObjectURL(file) : null)
  }

  function handleFoto2(file: File | null) {
    if (preview2) URL.revokeObjectURL(preview2)
    setFoto2(file)
    setPreview2(file ? URL.createObjectURL(file) : null)
  }

  function validarCamposObligatorios(): boolean {
    const esNegativa = f.tipo_prueba === 'negativa'

    const obligatorios = esNegativa
      ? [
          { key: 'reporte_numero' as const, nombre: 'Reporte N°' },
          { key: 'fecha' as const, nombre: 'Fecha' },
          { key: 'cliente' as const, nombre: 'Cliente' },
          { key: 'pozo' as const, nombre: 'Pozo' },
          { id: 'equipo', nombre: 'Unidad' },
          { id: 'sensor_wika', nombre: 'Sensor WIKA' },
          { key: 'elemento_ensayar' as const, nombre: 'Elemento a ensayar' },
          { key: 'operador_lider' as const, nombre: 'Operador líder' },
          { key: 'operador' as const, nombre: 'Operador' },
          { key: 'presion_entrampada' as const, nombre: 'Presión entrampada' },
          { key: 'presion_testigo_inicial' as const, nombre: 'Presión testigo inicial' },
          { key: 'presion_testigo_final' as const, nombre: 'Presión testigo final' },
          { key: 'hs_inicial_negativa' as const, nombre: 'Hs inicial' },
          { key: 'hs_final_negativa' as const, nombre: 'Hs final' },
          { key: 'resultado_ensayo' as const, nombre: 'Resultado del ensayo' },
        ]
      : [
          { key: 'reporte_numero' as const, nombre: 'Reporte N°' },
          { key: 'fecha' as const, nombre: 'Fecha' },
          { key: 'cliente' as const, nombre: 'Cliente' },
          { key: 'pozo' as const, nombre: 'Pozo' },
          { id: 'equipo', nombre: 'Unidad' },
          { id: 'sensor_wika', nombre: 'Sensor WIKA' },
          { key: 'presion_ensayo' as const, nombre: 'Presión de ensayo' },
          { key: 'tiempo_ensayo' as const, nombre: 'Tiempo de ensayo' },
          { key: 'resultado_ensayo' as const, nombre: 'Resultado del ensayo' },
          { key: 'elemento_ensayar' as const, nombre: 'Elemento a ensayar' },
          { key: 'operador_lider' as const, nombre: 'Operador líder' },
          { key: 'operador' as const, nombre: 'Operador' },
        ]

    for (const campo of obligatorios) {
      if ('key' in campo && campo.key === 'fecha') {
        const iso = toBackendDate(f.fecha)
        if (!iso) {
          setFormError('Completá la fecha del parte.')
          return false
        }
        continue
      }
      if ('key' in campo) {
        const key = campo.key as keyof typeof f
        const valor = String(f[key] ?? '').trim()
        if (!valor) {
          setFormError(`Falta completar: ${campo.nombre}`)
          return false
        }
      } else if (campo.id === 'equipo') {
        if (!unidadId.trim()) {
          setFormError(`Falta completar: ${campo.nombre}`)
          return false
        }
      } else if (campo.id === 'sensor_wika') {
        if (!wikaId.trim()) {
          setFormError(`Falta completar: ${campo.nombre}`)
          return false
        }
      }
    }
    return true
  }

  function resetFormulario() {
    setFormError(null)
    /* No limpiar formSuccess aquí: tras guardar ok se muestra el id y resetFormulario corre en el mismo tick. */
    setF(getFormStateAfterSave(isFromParteOperativo, prefillFromUrl))
    setUnidadId('')
    setWikaId('')
    if (preview1) URL.revokeObjectURL(preview1)
    if (preview2) URL.revokeObjectURL(preview2)
    setFoto1(null)
    setFoto2(null)
    setPreview1(null)
    setPreview2(null)
  }

  async function guardarParte() {
    setFormError(null)
    setFormSuccess(null)

    if (!validarCamposObligatorios()) return

    if (selectedUnidad && estaVencidoActivo(selectedUnidad.vencimiento)) {
      setFormError('La unidad seleccionada está vencida.')
      return
    }
    if (selectedWika && estaVencidoActivo(selectedWika.vencimiento)) {
      setFormError('El WIKA seleccionado está vencido.')
      return
    }

    const esNegativa = f.tipo_prueba === 'negativa'

    const unidadIx = unidades.findIndex((u) => String(u.id) === String(unidadId))
    const wikaIx = wikas.findIndex((w) => String(w.id) === String(wikaId))
    const unidadOpt = unidadIx >= 0 ? unidades[unidadIx] : undefined
    const wikaOpt = wikaIx >= 0 ? wikas[wikaIx] : undefined
    const equipoLabel = unidadOpt
      ? unidadOpt.descripcion || unidadOpt.numero_serie || `Unidad ${unidadIx + 1}`
      : ''
    const sensorWikaLabel = wikaOpt
      ? wikaOpt.descripcion || wikaOpt.numero_serie || `WIKA ${wikaIx + 1}`
      : ''

    try {
      setSaving(true)

      let foto_1_base64 = await fileToBase64Pure(foto1)
      let foto_2_base64 = await fileToBase64Pure(foto2)

      const datosComunes = {
        reporte_numero: f.reporte_numero.trim(),
        fecha: toBackendDate(f.fecha),
        cliente: f.cliente.trim(),
        equipo_general: f.equipo_general.trim(),
        equipo: equipoLabel,
        numero_serie_equipamiento: numeroSerieUnidad.trim(),
        vencimiento: toBackendDate(selectedUnidad?.vencimiento || ''),
        sensor_wika: sensorWikaLabel,
        numero_serie_wika: numeroSerieWika.trim(),
        vencimiento_wika: toBackendDate(selectedWika?.vencimiento || ''),
        yacimiento: f.yacimiento.trim(),
        pozo: f.pozo.trim(),
        tipo_prueba: f.tipo_prueba,
        presion_ensayo: f.presion_ensayo.trim(),
        tiempo_ensayo: f.tiempo_ensayo.trim(),
        fluido_utilizado: f.fluido_utilizado.trim(),
        elemento_ensayar: f.elemento_ensayar.trim(),
        marca: f.marca.trim(),
        modelo: f.modelo.trim(),
        numero_serie_elemento: f.numero_serie_elemento.trim(),
        numero_parte: f.numero_parte.trim(),
        detalle_ensayo: f.detalle_ensayo.trim(),
        numero_presinto: f.numero_presinto.trim(),
        resultado_ensayo: f.resultado_ensayo.trim(),
        supervisor_operativo: f.supervisor_operativo.trim(),
        operador_lider: f.operador_lider.trim(),
        operador: f.operador.trim(),
        ayudante: f.ayudante.trim(),
        observaciones: f.observaciones.trim(),
        foto_1_base64,
        foto_2_base64,
      }

      const datos = esNegativa
        ? {
            ...datosComunes,
            presion_entrampada: f.presion_entrampada.trim(),
            presion_testigo_inicial: f.presion_testigo_inicial.trim(),
            hs_inicial_negativa: f.hs_inicial_negativa.trim(),
            presion_testigo_final: f.presion_testigo_final.trim(),
            hs_final_negativa: f.hs_final_negativa.trim(),
            incremento: incremento_presion.trim(),
            porcentaje_perdida: porcentaje_perdida_negativa.trim(),
            presion_estabilizada: null,
            hs_estabilizada: null,
            presion_final: null,
            hs_final: null,
            caida_presion: null,
            porcentaje_caida: null,
          }
        : {
            ...datosComunes,
            presion_estabilizada: f.presion_estabilizada.trim(),
            hs_estabilizada: f.hs_estabilizada.trim(),
            presion_final: f.presion_final.trim(),
            hs_final: f.hs_final.trim(),
            caida_presion: caida_presion.trim(),
            porcentaje_caida: porcentaje_caida.trim(),
            presion_entrampada: null,
            presion_testigo_inicial: null,
            hs_inicial_negativa: null,
            presion_testigo_final: null,
            hs_final_negativa: null,
            incremento: null,
            porcentaje_perdida: null,
          }

      if (process.env.NODE_ENV === 'development') {
        const payloadLog = {
          ...datos,
          foto_1_base64: datos.foto_1_base64
            ? `[base64 ${datos.foto_1_base64.length} chars]`
            : null,
          foto_2_base64: datos.foto_2_base64
            ? `[base64 ${datos.foto_2_base64.length} chars]`
            : null,
        }
        console.log('PAYLOAD GUARDAR PARTE', payloadLog)
      }

      const resultado = await post<GuardarParteResponse>(
        '/guardar-parte',
        datos as unknown as Record<string, unknown>
      )

      if (process.env.NODE_ENV === 'development') {
        console.log('RESPUESTA GUARDAR PARTE', resultado)
      }

      const okGuardado =
        resultado &&
        typeof resultado === 'object' &&
        (resultado.ok === true ||
          (resultado.parte_id != null && String(resultado.parte_id) !== '') ||
          (resultado.parte?.id != null && String(resultado.parte.id) !== ''))

      if (!okGuardado) {
        const r =
          resultado && typeof resultado === 'object'
            ? (resultado as Record<string, unknown>)
            : null
        const msg =
          (r && typeof r.error === 'string' && r.error) ||
          (r && typeof r.message === 'string' && r.message) ||
          'Error al guardar el parte'
        throw new Error(msg)
      }

      const parteIdGuardado =
        resultado.parte_id != null && String(resultado.parte_id) !== ''
          ? String(resultado.parte_id)
          : resultado.parte?.id != null && String(resultado.parte.id) !== ''
            ? String(resultado.parte.id)
            : null

      setFormSuccess(`Parte guardado correctamente. ID interno: ${parteIdGuardado}`)
      foto_1_base64 = null
      foto_2_base64 = null

      if (parteIdGuardado) {
        resetFormulario()
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('ERROR GUARDAR PARTE', e)
      }
      setFormError(normalizeUserError(e) ?? 'Error al guardar el parte. Revisá los datos e intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const bloqueadoEquipos = loadingEquipos || !!equiposError

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="Reporte de PH" subtitle="Carga de datos del ensayo" />

      {loadingEquipos ? <LoadingState label="Cargando unidades y WIKAs…" /> : null}
      {equiposError ? (
        <InlineMessage
          kind="error"
          title="No se pudieron cargar unidades y WIKAs"
          description={equiposError}
        />
      ) : null}
      {formError ? <InlineMessage kind="error" title={formError} /> : null}
      {formSuccess ? (
        <InlineMessage kind="success" title={formSuccess} />
      ) : null}

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Datos generales</div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="reporte_numero">
                Reporte N°
              </label>
              <input
                id="reporte_numero"
                className={inputClass}
                value={f.reporte_numero}
                onChange={(e) => setField('reporte_numero', e.target.value)}
                disabled={bloqueadoEquipos}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="fecha">
                Fecha
              </label>
              <input
                id="fecha"
                type="date"
                name="fecha_parte_ph_iso"
                autoComplete="off"
                className={inputClass}
                value={toInputDate(f.fecha)}
                onChange={(e) => {
                  setFormError(null)
                  setField('fecha', toInputDate(e.target.value))
                }}
                disabled={bloqueadoEquipos}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cliente">
                Cliente
              </label>
              <input
                id="cliente"
                className={inputClass}
                value={f.cliente}
                onChange={(e) => setField('cliente', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="equipo_general">
                Equipo / servicio
              </label>
              <input
                id="equipo_general"
                className={inputClass}
                value={f.equipo_general}
                onChange={(e) => setField('equipo_general', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="yacimiento">
                Yacimiento
              </label>
              <input
                id="yacimiento"
                className={inputClass}
                value={f.yacimiento}
                onChange={(e) => setField('yacimiento', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="pozo">
                Pozo
              </label>
              <input
                id="pozo"
                className={inputClass}
                value={f.pozo}
                onChange={(e) => setField('pozo', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Datos del ensayo</div>
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="rounded-2xl border border-border bg-surface-2 p-4">
            <label className={labelClass} htmlFor="tipo_prueba">
              Tipo de prueba
            </label>
            <select
              id="tipo_prueba"
              className={inputClass}
              value={f.tipo_prueba}
              onChange={(e) =>
                setField('tipo_prueba', e.target.value as 'positiva' | 'negativa')
              }
              disabled={bloqueadoEquipos}
            >
              <option value="positiva">Prueba positiva</option>
              <option value="negativa">Prueba negativa</option>
            </select>
          </div>

          {f.tipo_prueba === 'positiva' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="presion_ensayo">
                  Presión de ensayo
                </label>
                <input
                  id="presion_ensayo"
                  className={inputClass}
                  value={f.presion_ensayo}
                  onChange={(e) => setField('presion_ensayo', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="tiempo_ensayo">
                  Tiempo de ensayo
                </label>
                <input
                  id="tiempo_ensayo"
                  className={inputClass}
                  value={f.tiempo_ensayo}
                  onChange={(e) => setField('tiempo_ensayo', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="fluido_utilizado">
                  Fluido utilizado
                </label>
                <input
                  id="fluido_utilizado"
                  className={inputClass}
                  value={f.fluido_utilizado}
                  onChange={(e) => setField('fluido_utilizado', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="resultado_ensayo">
                  Resultado del ensayo
                </label>
                <input
                  id="resultado_ensayo"
                  className={inputClass}
                  value={f.resultado_ensayo}
                  onChange={(e) => setField('resultado_ensayo', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="presion_estabilizada">
                  Presión estabilizada
                </label>
                <input
                  id="presion_estabilizada"
                  className={inputClass}
                  value={f.presion_estabilizada}
                  onChange={(e) => setField('presion_estabilizada', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="hs_estabilizada">
                  Hs estabilizada
                </label>
                <input
                  id="hs_estabilizada"
                  className={inputClass}
                  value={f.hs_estabilizada}
                  onChange={(e) => setField('hs_estabilizada', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="presion_final">
                  Presión final
                </label>
                <input
                  id="presion_final"
                  className={inputClass}
                  value={f.presion_final}
                  onChange={(e) => setField('presion_final', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="hs_final">
                  Hs final
                </label>
                <input
                  id="hs_final"
                  className={inputClass}
                  value={f.hs_final}
                  onChange={(e) => setField('hs_final', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="caida_presion">
                  Caída de presión
                </label>
                <input
                  id="caida_presion"
                  className={inputClass}
                  readOnly
                  value={caida_presion}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="porcentaje_caida">
                  % de caída
                </label>
                <input
                  id="porcentaje_caida"
                  className={inputClass}
                  readOnly
                  value={porcentaje_caida}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="presion_entrampada">
                  Presión entrampada
                </label>
                <input
                  id="presion_entrampada"
                  className={inputClass}
                  value={f.presion_entrampada}
                  onChange={(e) => setField('presion_entrampada', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="presion_testigo_inicial">
                  Presión testigo inicial
                </label>
                <input
                  id="presion_testigo_inicial"
                  className={inputClass}
                  value={f.presion_testigo_inicial}
                  onChange={(e) => setField('presion_testigo_inicial', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="hs_inicial_negativa">
                  Hs inicial
                </label>
                <input
                  id="hs_inicial_negativa"
                  className={inputClass}
                  value={f.hs_inicial_negativa}
                  onChange={(e) => setField('hs_inicial_negativa', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="presion_testigo_final">
                  Presión testigo final
                </label>
                <input
                  id="presion_testigo_final"
                  className={inputClass}
                  value={f.presion_testigo_final}
                  onChange={(e) => setField('presion_testigo_final', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="hs_final_negativa">
                  Hs final
                </label>
                <input
                  id="hs_final_negativa"
                  className={inputClass}
                  value={f.hs_final_negativa}
                  onChange={(e) => setField('hs_final_negativa', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="incremento_presion">
                  Incremento de presión
                </label>
                <input
                  id="incremento_presion"
                  className={inputClass}
                  readOnly
                  value={incremento_presion}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="porcentaje_perdida_negativa">
                  % pérdida (sobre presión entrampada)
                </label>
                <input
                  id="porcentaje_perdida_negativa"
                  className={inputClass}
                  readOnly
                  value={porcentaje_perdida_negativa}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="resultado_ensayo_negativa">
                  Resultado del ensayo
                </label>
                <input
                  id="resultado_ensayo_negativa"
                  className={inputClass}
                  value={f.resultado_ensayo}
                  onChange={(e) => setField('resultado_ensayo', e.target.value)}
                  disabled={bloqueadoEquipos}
                />
              </div>
            </div>
          )}

          <div>
            <label className={labelClass} htmlFor="observaciones">
              Observaciones
            </label>
            <p className="mb-2 text-sm text-muted">
              Podés agregar aclaraciones, novedades del ensayo o cualquier dato relevante.
            </p>
            <textarea
              id="observaciones"
              className={textareaClass}
              value={f.observaciones}
              onChange={(e) => setField('observaciones', e.target.value)}
              disabled={bloqueadoEquipos}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Elemento a ensayar</div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="elemento_ensayar">
                Elemento a ensayar
              </label>
              <input
                id="elemento_ensayar"
                className={inputClass}
                value={f.elemento_ensayar}
                onChange={(e) => setField('elemento_ensayar', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="marca">
                Marca
              </label>
              <input
                id="marca"
                className={inputClass}
                value={f.marca}
                onChange={(e) => setField('marca', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="modelo">
                Modelo
              </label>
              <input
                id="modelo"
                className={inputClass}
                value={f.modelo}
                onChange={(e) => setField('modelo', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="numero_serie_elemento">
                N° de serie
              </label>
              <input
                id="numero_serie_elemento"
                className={inputClass}
                value={f.numero_serie_elemento}
                onChange={(e) => setField('numero_serie_elemento', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="numero_parte">
                N° de parte
              </label>
              <input
                id="numero_parte"
                className={inputClass}
                value={f.numero_parte}
                onChange={(e) => setField('numero_parte', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="numero_presinto">
                N° de precinto
              </label>
              <input
                id="numero_presinto"
                className={inputClass}
                value={f.numero_presinto}
                onChange={(e) => setField('numero_presinto', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
          </div>
          <div className="mt-4">
            <label className={labelClass} htmlFor="detalle_ensayo">
              Detalle del ensayo
            </label>
            <textarea
              id="detalle_ensayo"
              className={textareaClass}
              value={f.detalle_ensayo}
              onChange={(e) => setField('detalle_ensayo', e.target.value)}
              disabled={bloqueadoEquipos}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Equipamiento</div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="equipo">
                Unidad
              </label>
              <select
                id="equipo"
                className={inputClass}
                value={unidadId}
                onChange={(e) => {
                  setFormError(null)
                  setUnidadId(e.target.value)
                }}
                disabled={bloqueadoEquipos}
              >
                <option value="">Seleccionar unidad</option>
                {unidades.map((u, i) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.descripcion || u.numero_serie || `Unidad ${i + 1}`}
                  </option>
                ))}
              </select>
              <div className="mt-3 grid gap-3">
                <div>
                  <label className={labelClass} htmlFor="numero_serie_unidad">
                    N° de serie unidad
                  </label>
                  <input
                    id="numero_serie_unidad"
                    type="text"
                    readOnly
                    tabIndex={-1}
                    autoComplete="off"
                    disabled={bloqueadoEquipos}
                    className={`${inputClass} cursor-default bg-surface-2 ${unidadVencida ? 'border-rose-500 font-semibold text-rose-900 dark:text-rose-100' : ''}`}
                    value={numeroSerieUnidad}
                    aria-readonly="true"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="vencimiento_unidad">
                    Vencimiento unidad (dd/mm/aaaa)
                  </label>
                  <input
                    id="vencimiento_unidad"
                    type="text"
                    readOnly
                    tabIndex={-1}
                    autoComplete="off"
                    inputMode="text"
                    disabled={bloqueadoEquipos}
                    className={`${inputClass} cursor-default bg-surface-2 ${unidadVencida ? 'border-rose-500 font-semibold text-rose-900 dark:text-rose-100' : ''}`}
                    value={vencimientoUnidadDisplay}
                    aria-readonly="true"
                  />
                  {selectedUnidad ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {(() => {
                        const v = vencimientoState(selectedUnidad.vencimiento)
                        const variant: 'neutral' | 'danger' | 'warning' | 'accent' | 'success' =
                          v.state === 'vencido'
                            ? 'danger'
                            : v.state === 'critico'
                            ? 'warning'
                            : v.state === 'proximo'
                            ? 'accent'
                            : v.state === 'ok'
                            ? 'success'
                            : 'neutral'
                        return (
                          <StatusBadge variant={variant}>
                            {unidadVencida ? 'Vencida' : vencimientoLabel(v.state, v.days)}
                          </StatusBadge>
                        )
                      })()}
                    </div>
                  ) : null}
                  {unidadVencida ? (
                    <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                      ⚠️ Unidad vencida. No debe utilizarse.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="sensor_wika">
                Sensor WIKA
              </label>
              <select
                id="sensor_wika"
                className={inputClass}
                value={wikaId}
                onChange={(e) => {
                  setFormError(null)
                  setWikaId(e.target.value)
                }}
                disabled={bloqueadoEquipos}
              >
                <option value="">Seleccionar WIKA</option>
                {wikas.map((w, i) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.descripcion || w.numero_serie || `WIKA ${i + 1}`}
                  </option>
                ))}
              </select>
              <div className="mt-3 grid gap-3">
                <div>
                  <label className={labelClass} htmlFor="numero_serie_wika">
                    N° de serie WIKA
                  </label>
                  <input
                    id="numero_serie_wika"
                    type="text"
                    readOnly
                    tabIndex={-1}
                    autoComplete="off"
                    disabled={bloqueadoEquipos}
                    className={`${inputClass} cursor-default bg-surface-2 ${wikaVencida ? 'border-rose-500 font-semibold text-rose-900 dark:text-rose-100' : ''}`}
                    value={numeroSerieWika}
                    aria-readonly="true"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="vencimiento_wika">
                    Vencimiento WIKA (dd/mm/aaaa)
                  </label>
                  <input
                    id="vencimiento_wika"
                    type="text"
                    readOnly
                    tabIndex={-1}
                    autoComplete="off"
                    inputMode="text"
                    disabled={bloqueadoEquipos}
                    className={`${inputClass} cursor-default bg-surface-2 ${wikaVencida ? 'border-rose-500 font-semibold text-rose-900 dark:text-rose-100' : ''}`}
                    value={vencimientoWikaDisplay}
                    aria-readonly="true"
                  />
                  {selectedWika ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {(() => {
                        const v = vencimientoState(selectedWika.vencimiento)
                        const variant: 'neutral' | 'danger' | 'warning' | 'accent' | 'success' =
                          v.state === 'vencido'
                            ? 'danger'
                            : v.state === 'critico'
                            ? 'warning'
                            : v.state === 'proximo'
                            ? 'accent'
                            : v.state === 'ok'
                            ? 'success'
                            : 'neutral'
                        return (
                          <StatusBadge variant={variant}>
                            {wikaVencida ? 'Vencido' : vencimientoLabel(v.state, v.days)}
                          </StatusBadge>
                        )
                      })()}
                    </div>
                  ) : null}
                  {wikaVencida ? (
                    <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                      ⚠️ WIKA vencido. No debe utilizarse.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Personal involucrado</div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="supervisor_operativo">
                Supervisor operativo
              </label>
              <input
                id="supervisor_operativo"
                className={inputClass}
                value={f.supervisor_operativo}
                onChange={(e) => setField('supervisor_operativo', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="operador_lider">
                Operador líder
              </label>
              <input
                id="operador_lider"
                className={inputClass}
                value={f.operador_lider}
                onChange={(e) => setField('operador_lider', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="operador">
                Operador
              </label>
              <input
                id="operador"
                className={inputClass}
                value={f.operador}
                onChange={(e) => setField('operador', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="ayudante">
                Ayudante
              </label>
              <input
                id="ayudante"
                className={inputClass}
                value={f.ayudante}
                onChange={(e) => setField('ayudante', e.target.value)}
                disabled={bloqueadoEquipos}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Registro fotográfico</div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-dashed border-border bg-surface-2 p-4">
              <label className={labelClass} htmlFor="foto_1">
                Foto 1
              </label>
              <input
                id="foto_1"
                type="file"
                accept="image/*"
                capture="environment"
                className={`${inputClass} py-2`}
                disabled={bloqueadoEquipos || saving}
                onChange={(e) => handleFoto1(e.target.files?.[0] ?? null)}
              />
              {preview1 ? (
                <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob URL preview */}
                  <img
                    src={preview1}
                    alt="Vista previa foto 1"
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-dashed border-border bg-surface-2 p-4">
              <label className={labelClass} htmlFor="foto_2">
                Foto 2
              </label>
              <input
                id="foto_2"
                type="file"
                accept="image/*"
                capture="environment"
                className={`${inputClass} py-2`}
                disabled={bloqueadoEquipos || saving}
                onChange={(e) => handleFoto2(e.target.files?.[0] ?? null)}
              />
              {preview2 ? (
                <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob URL preview */}
                  <img
                    src={preview2}
                    alt="Vista previa foto 2"
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Confirmación y guardado</div>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-muted">
            Verificá los datos antes de guardar el reporte.
          </p>
          {saving ? <LoadingState label="Procesando datos y fotos…" /> : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={guardarParte}
              disabled={bloqueadoEquipos || saving}
              className="h-12 min-w-[160px] rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] px-6 text-sm font-semibold text-white shadow-[var(--shadow-app)] hover:opacity-95 disabled:opacity-60"
            >
              Guardar PH
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
