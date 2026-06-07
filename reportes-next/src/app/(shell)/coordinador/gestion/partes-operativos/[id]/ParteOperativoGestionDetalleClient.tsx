'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { GestionInventarioGate } from '@/components/coordinador/inventario/GestionInventarioGate'
import {
  formGridClass,
  inputClass,
  labelClass,
  textareaClass,
} from '@/components/operador/parte-operativo-styles'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { ModernTable, Td, Th } from '@/components/ui/ModernTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { get, post, put } from '@/lib/api'
import { routes } from '@/lib/constants/routes'
import {
  COORD_BTN_LINK,
  COORD_BTN_PRIMARY_LG,
  COORD_BTN_SECONDARY_LG,
} from '@/lib/coordinador/theme'
import { toInputDate } from '@/lib/date'
import { parteOperativoPdfUrl, parteOperativoTienePdf } from '@/lib/parte-operativo-list'
import {
  parteOperativoListState,
  parteOperativoListStateLabel,
  parteOperativoListStateVariant,
} from '@/lib/status'
import type {
  GetParteOperativoDetalleResponse,
  HistorialParteOperativo,
  ParteOperativoDetalle,
  ParteOperativoPhVinculo,
  ParteOperativoServicioRow,
  PostServiciosAdminResponse,
  PutParteOperativoAdminResponse,
  ReabrirParteResponse,
} from '@/lib/types/partes-operativos-admin'
import type {
  CerrarParteOperativoResponse,
  ParteOperativoListItem,
} from '@/lib/types/partes-operativos'

const ADMIN_USUARIO = 'Coordinación'

const MOTIVO_PLACEHOLDER =
  'Corrección de kilometraje, servicio omitido, error de carga, corrección solicitada por cliente...'

type MotivoAccion = 'guardar' | 'reabrir' | 'regenerar'

function historialAccionLabel(accion: string): string {
  switch (accion) {
    case 'MODIFICACION_ADMINISTRATIVA':
      return 'Modificación administrativa'
    case 'PDF_REGENERADO':
      return 'PDF regenerado'
    case 'PARTE_REABIERTO':
      return 'Parte reabierto'
    default:
      return accion
  }
}

function formatHistorialFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

type ServicioEditable = {
  key: string
  codigo_servicio: string
  pos: string
  descripcion: string
  cantidad: string
}

function servicioToEditable(s: ParteOperativoServicioRow, index: number): ServicioEditable {
  return {
    key: s.id || `srv-${index}`,
    codigo_servicio: String(s.codigo_servicio ?? s.linea ?? '10'),
    pos: String(s.pos ?? ''),
    descripcion: String(s.descripcion ?? ''),
    cantidad: String(s.cantidad ?? 0),
  }
}

function emptyServicio(): ServicioEditable {
  return {
    key: `new-${Date.now()}`,
    codigo_servicio: '10',
    pos: '',
    descripcion: '',
    cantidad: '0',
  }
}

export function ParteOperativoGestionDetalleClient() {
  return (
    <GestionInventarioGate>
      {({ logout }) => <ParteOperativoGestionDetalleAuthed logout={logout} />}
    </GestionInventarioGate>
  )
}

function ParteOperativoGestionDetalleAuthed({ logout }: { logout: () => void }) {
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [info, setInfo] = React.useState<string | null>(null)

  const [parte, setParte] = React.useState<ParteOperativoDetalle | null>(null)
  const [servicios, setServicios] = React.useState<ServicioEditable[]>([])
  const [pruebasPh, setPruebasPh] = React.useState<ParteOperativoPhVinculo[]>([])
  const [historial, setHistorial] = React.useState<HistorialParteOperativo[]>([])

  const [motivoModalOpen, setMotivoModalOpen] = React.useState(false)
  const [motivoText, setMotivoText] = React.useState('')
  const [motivoAccion, setMotivoAccion] = React.useState<MotivoAccion | null>(null)

  const [form, setForm] = React.useState({
    fecha: '',
    pozo: '',
    yacimiento: '',
    operadora: '',
    contratista: '',
    unidad_pesada: '',
    salida_desde: '',
    km: '',
    operador_1: '',
    operador_2: '',
    operador_3: '',
    observaciones: '',
    estado: 'abierto',
  })

  const load = React.useCallback(async () => {
    const data = await get<GetParteOperativoDetalleResponse>(
      `/partes-operativos/${encodeURIComponent(id)}`
    )
    if (!data.parte) throw new Error(data.error || 'Parte no encontrado')

    const p = data.parte
    setParte(p)
    setForm({
      fecha: toInputDate(p.fecha || ''),
      pozo: p.pozo ?? '',
      yacimiento: p.yacimiento ?? '',
      operadora: p.operadora ?? '',
      contratista: p.contratista ?? 'KOMPASS',
      unidad_pesada: p.unidad_pesada ?? p.unidad ?? '',
      salida_desde: p.salida_desde ?? '',
      km: p.km != null ? String(p.km) : '',
      operador_1: p.operador_1 ?? '',
      operador_2: p.operador_2 ?? '',
      operador_3: p.operador_3 ?? '',
      observaciones: p.observaciones ?? '',
      estado: p.estado ?? 'abierto',
    })
    setServicios((data.servicios || []).map(servicioToEditable))
    setPruebasPh(data.pruebas_ph || [])
    setHistorial(data.historial || [])
  }, [id])

  React.useEffect(() => {
    void (async () => {
      try {
        setLoading(true)
        setError(null)
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [load])

  const cerrado = form.estado === 'cerrado'
  const listState = parte
    ? parteOperativoListState(parte as ParteOperativoListItem & Record<string, unknown>)
    : 'pendiente_cierre'
  const pdfUrl = parte
    ? parteOperativoPdfUrl(parte as ParteOperativoListItem & Record<string, unknown>)
    : null
  const tienePdf = parte
    ? parteOperativoTienePdf(parte as ParteOperativoListItem & Record<string, unknown>)
    : false

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function abrirModalMotivo(accion: MotivoAccion) {
    setMotivoAccion(accion)
    setMotivoText('')
    setMotivoModalOpen(true)
  }

  function cerrarModalMotivo() {
    setMotivoModalOpen(false)
    setMotivoAccion(null)
    setMotivoText('')
  }

  const motivoValido = motivoText.trim().length > 0

  async function confirmarMotivo() {
    if (!motivoAccion || !motivoValido) return
    const motivo = motivoText.trim()
    cerrarModalMotivo()

    if (motivoAccion === 'guardar') {
      await guardarCambios(motivo)
    } else if (motivoAccion === 'reabrir') {
      await reabrirParte(motivo)
    } else if (motivoAccion === 'regenerar') {
      await regenerarPdf(motivo)
    }
  }

  async function guardarCambios(motivo?: string) {
    try {
      setSaving(true)
      setError(null)
      setInfo(null)

      const body: Record<string, unknown> = {
        fecha: form.fecha || null,
        pozo: form.pozo.trim(),
        yacimiento: form.yacimiento.trim() || null,
        operadora: form.operadora.trim() || null,
        contratista: form.contratista.trim() || null,
        unidad_pesada: form.unidad_pesada.trim() || null,
        salida_desde: form.salida_desde.trim() || null,
        km: form.km.trim() || null,
        operador_1: form.operador_1.trim() || null,
        operador_2: form.operador_2.trim() || null,
        operador_3: form.operador_3.trim() || null,
        observaciones: form.observaciones.trim() || null,
        estado: form.estado,
        usuario: ADMIN_USUARIO,
      }

      if (motivo?.trim()) {
        body.motivo = motivo.trim()
      }

      const putData = await put<PutParteOperativoAdminResponse>(
        `/partes-operativos/${encodeURIComponent(id)}/admin`,
        body
      )

      if (putData.ok === false) {
        throw new Error(putData.error || 'No se pudo guardar el parte')
      }

      const payloadServicios = servicios
        .filter((s) => Number(s.cantidad) > 0)
        .map((s) => ({
          codigo_servicio: s.codigo_servicio.trim() || '10',
          pos: s.pos.trim(),
          descripcion: s.descripcion.trim(),
          cantidad: Number(s.cantidad) || 0,
        }))
        .filter((s) => s.pos && s.descripcion)

      const serviciosBody: Record<string, unknown> = {
        servicios: payloadServicios,
        admin: true,
        usuario: ADMIN_USUARIO,
      }
      if (motivo?.trim()) {
        serviciosBody.motivo = motivo.trim()
      }

      await post<PostServiciosAdminResponse>(
        `/partes-operativos/${encodeURIComponent(id)}/servicios`,
        serviciosBody
      )

      setInfo('Cambios guardados correctamente.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function reabrirParte(motivo: string) {
    try {
      setActionLoading('reabrir')
      setError(null)
      setInfo(null)

      const data = await post<ReabrirParteResponse>(
        `/partes-operativos/${encodeURIComponent(id)}/reabrir`,
        { motivo, usuario: ADMIN_USUARIO }
      )

      if (data.ok === false) {
        throw new Error(data.error || 'No se pudo reabrir el parte')
      }

      setInfo('Parte reabierto. Podés editar y volver a cerrar cuando corresponda.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActionLoading(null)
    }
  }

  async function regenerarPdf(motivo: string) {
    try {
      setActionLoading('pdf')
      setError(null)
      setInfo(null)

      const data = await post<CerrarParteOperativoResponse>(
        `/partes-operativos/${encodeURIComponent(id)}/cerrar`,
        { regenerar: true, motivo, usuario: ADMIN_USUARIO }
      )

      if (data.ok === false) {
        throw new Error(data.error || 'No se pudo regenerar el PDF')
      }

      setInfo('PDF regenerado correctamente.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return <LoadingState label="Cargando parte operativo…" />
  }

  if (!parte) {
    return (
      <InlineMessage
        kind="error"
        title="Parte no encontrado"
        description={error || 'No se pudo cargar el detalle.'}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Parte operativo N° ${parte.numero_parte ?? '—'}`}
        subtitle="Edición administrativa del parte y sus servicios."
        right={
          <>
            <Link
              href={routes.coordinador.gestion.partesOperativos}
              className={COORD_BTN_LINK}
            >
              Volver al listado
            </Link>
            <Link
              href={routes.coordinador.inventario.gestion}
              className={COORD_BTN_LINK}
            >
              Panel de gestión
            </Link>
            <StatusBadge variant={parteOperativoListStateVariant(listState)}>
              {parteOperativoListStateLabel(listState)}
            </StatusBadge>
            <button
              type="button"
              onClick={logout}
              className={COORD_BTN_LINK}
            >
              Cerrar sesión
            </button>
          </>
        }
      />

      {info ? <InlineMessage kind="success" title={info} /> : null}
      {error ? <InlineMessage kind="error" title="Error" description={error} /> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={COORD_BTN_PRIMARY_LG}
          disabled={saving}
          onClick={() => (cerrado ? abrirModalMotivo('guardar') : void guardarCambios())}
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {cerrado ? (
          <button
            type="button"
            className={COORD_BTN_SECONDARY_LG}
            disabled={!!actionLoading}
            onClick={() => abrirModalMotivo('reabrir')}
          >
            {actionLoading === 'reabrir' ? 'Reabriendo…' : 'Reabrir parte'}
          </button>
        ) : null}
        <button
          type="button"
          className={COORD_BTN_SECONDARY_LG}
          disabled={!!actionLoading || !cerrado}
          onClick={() => abrirModalMotivo('regenerar')}
        >
          {actionLoading === 'pdf' ? 'Generando PDF…' : 'Regenerar PDF'}
        </button>
        {tienePdf && pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={COORD_BTN_SECONDARY_LG}
          >
            Ver PDF
          </a>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Datos del parte</div>
        </CardHeader>
        <CardBody className="pt-0">
          <div className={formGridClass}>
            <div>
              <label className={labelClass} htmlFor="fecha">
                Fecha
              </label>
              <input
                id="fecha"
                type="date"
                className={inputClass}
                value={form.fecha}
                onChange={(e) => setField('fecha', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="estado">
                Estado
              </label>
              <select
                id="estado"
                className={inputClass}
                value={form.estado}
                onChange={(e) => setField('estado', e.target.value)}
              >
                <option value="abierto">Abierto</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="pozo">
                Pozo
              </label>
              <input
                id="pozo"
                className={inputClass}
                value={form.pozo}
                onChange={(e) => setField('pozo', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="yacimiento">
                Yacimiento
              </label>
              <input
                id="yacimiento"
                className={inputClass}
                value={form.yacimiento}
                onChange={(e) => setField('yacimiento', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="operadora">
                Operadora
              </label>
              <input
                id="operadora"
                className={inputClass}
                value={form.operadora}
                onChange={(e) => setField('operadora', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="contratista">
                Contratista
              </label>
              <input
                id="contratista"
                className={inputClass}
                value={form.contratista}
                onChange={(e) => setField('contratista', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="unidad_pesada">
                Unidad pesada
              </label>
              <input
                id="unidad_pesada"
                className={inputClass}
                value={form.unidad_pesada}
                onChange={(e) => setField('unidad_pesada', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="salida_desde">
                Salida desde
              </label>
              <input
                id="salida_desde"
                className={inputClass}
                value={form.salida_desde}
                onChange={(e) => setField('salida_desde', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="km">
                Kilómetros
              </label>
              <input
                id="km"
                className={inputClass}
                value={form.km}
                onChange={(e) => setField('km', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="operador_1">
                Operador líder
              </label>
              <input
                id="operador_1"
                className={inputClass}
                value={form.operador_1}
                onChange={(e) => setField('operador_1', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="operador_2">
                Operador
              </label>
              <input
                id="operador_2"
                className={inputClass}
                value={form.operador_2}
                onChange={(e) => setField('operador_2', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="operador_3">
                Ayudante
              </label>
              <input
                id="operador_3"
                className={inputClass}
                value={form.operador_3}
                onChange={(e) => setField('operador_3', e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4">
            <label className={labelClass} htmlFor="observaciones">
              Observaciones
            </label>
            <textarea
              id="observaciones"
              className={textareaClass}
              rows={6}
              value={form.observaciones}
              onChange={(e) => setField('observaciones', e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold">Servicios</div>
            <button
              type="button"
              className={COORD_BTN_SECONDARY_LG}
              onClick={() => setServicios((prev) => [...prev, emptyServicio()])}
            >
              Agregar línea
            </button>
          </div>
        </CardHeader>
        <CardBody className="pt-0 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Pos.</Th>
                <Th>Descripción</Th>
                <Th>Cantidad</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {servicios.length === 0 ? (
                <tr>
                  <Td colSpan={5} className="text-muted">
                    Sin servicios cargados.
                  </Td>
                </tr>
              ) : (
                servicios.map((s, index) => (
                  <tr key={s.key} className="border-t border-border">
                    <Td>
                      <input
                        className={inputClass}
                        value={s.codigo_servicio}
                        onChange={(e) =>
                          setServicios((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, codigo_servicio: e.target.value } : row
                            )
                          )
                        }
                      />
                    </Td>
                    <Td>
                      <input
                        className={inputClass}
                        value={s.pos}
                        onChange={(e) =>
                          setServicios((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, pos: e.target.value } : row
                            )
                          )
                        }
                      />
                    </Td>
                    <Td>
                      <input
                        className={inputClass}
                        value={s.descripcion}
                        onChange={(e) =>
                          setServicios((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, descripcion: e.target.value } : row
                            )
                          )
                        }
                      />
                    </Td>
                    <Td>
                      <input
                        type="number"
                        min="0"
                        className={inputClass}
                        value={s.cantidad}
                        onChange={(e) =>
                          setServicios((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, cantidad: e.target.value } : row
                            )
                          )
                        }
                      />
                    </Td>
                    <Td>
                      <button
                        type="button"
                        className="text-sm font-semibold text-rose-600 hover:underline"
                        onClick={() =>
                          setServicios((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        Quitar
                      </button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">PH vinculadas</div>
        </CardHeader>
        <CardBody className="pt-0 overflow-x-auto">
          <ModernTable>
            <thead>
              <tr>
                <Th>Reporte N°</Th>
                <Th>Tipo</Th>
                <Th>Elemento / válvula</Th>
                <Th>Resultado</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acción</Th>
              </tr>
            </thead>
            <tbody>
              {pruebasPh.length === 0 ? (
                <tr>
                  <Td colSpan={6} className="text-muted">
                    No hay PH vinculadas a este parte.
                  </Td>
                </tr>
              ) : (
                pruebasPh.map((ph) => (
                  <tr key={ph.id || ph.reporte_ph_id}>
                    <Td className="font-semibold">{ph.reporte_numero ?? '—'}</Td>
                    <Td>{ph.tipo_prueba ?? '—'}</Td>
                    <Td>{ph.elemento_ensayar ?? ph.valvula ?? '—'}</Td>
                    <Td>{ph.resultado_ensayo ?? '—'}</Td>
                    <Td>{ph.estado ?? '—'}</Td>
                    <Td className="text-right">
                      {ph.reporte_ph_id ? (
                        <Link
                          href={routes.coordinador.reportePhDetalle(String(ph.reporte_ph_id))}
                          className={COORD_BTN_SECONDARY_LG}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir PH
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </ModernTable>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Historial del parte</div>
        </CardHeader>
        <CardBody className="pt-0 overflow-x-auto">
          <ModernTable>
            <thead>
              <tr>
                <Th>Fecha / hora</Th>
                <Th>Usuario</Th>
                <Th>Acción</Th>
                <Th>Motivo</Th>
                <Th>Estado anterior</Th>
                <Th>Estado nuevo</Th>
              </tr>
            </thead>
            <tbody>
              {historial.length === 0 ? (
                <tr>
                  <Td colSpan={6} className="text-muted">
                    No hay registros de auditoría para este parte.
                  </Td>
                </tr>
              ) : (
                historial.map((row) => (
                  <tr key={row.id}>
                    <Td className="whitespace-nowrap">
                      {formatHistorialFecha(row.created_at)}
                    </Td>
                    <Td>{row.usuario ?? '—'}</Td>
                    <Td>{historialAccionLabel(row.accion)}</Td>
                    <Td className="max-w-xs whitespace-pre-wrap">{row.motivo}</Td>
                    <Td>{row.estado_anterior ?? '—'}</Td>
                    <Td>{row.estado_nuevo ?? '—'}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </ModernTable>
        </CardBody>
      </Card>

      <Modal
        open={motivoModalOpen}
        onClose={cerrarModalMotivo}
        title="Motivo de la modificación"
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" className={COORD_BTN_SECONDARY_LG} onClick={cerrarModalMotivo}>
              Cancelar
            </button>
            <button
              type="button"
              className={COORD_BTN_PRIMARY_LG}
              disabled={!motivoValido || saving || !!actionLoading}
              onClick={() => void confirmarMotivo()}
            >
              Confirmar
            </button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Indicá el motivo de este cambio. Es obligatorio para partes cerrados, reapertura y
          regeneración de PDF.
        </p>
        <label className={labelClass} htmlFor="motivo-modificacion">
          Motivo
        </label>
        <textarea
          id="motivo-modificacion"
          className={textareaClass}
          rows={4}
          value={motivoText}
          placeholder={MOTIVO_PLACEHOLDER}
          onChange={(e) => setMotivoText(e.target.value)}
        />
      </Modal>
    </div>
  )
}
