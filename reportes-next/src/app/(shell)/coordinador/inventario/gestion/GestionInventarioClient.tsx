'use client'

/**
 * Módulo de Gestión de inventario (solo UI por ahora).
 *
 * Futuros endpoints (desde submit / guardado):
 * TODO: POST /activos — alta de nuevo activo
 * TODO: POST /consumibles — alta de consumible
 * TODO: POST /movimientos-activos — registro de movimiento de activo
 * TODO: POST /movimientos-consumibles — registro de movimiento de consumible
 * TODO: POST /generar-pdf-movimiento — PDF de comprobante de movimiento/trazabilidad
 */

import * as React from 'react'
import { GestionInventarioGate } from '@/components/coordinador/inventario/GestionInventarioGate'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn } from '@/lib/cn'

type TabId = 'activo' | 'consumible' | 'mov-activo' | 'mov-consumible'

const TABS: { id: TabId; label: string }[] = [
  { id: 'activo', label: 'Nuevo activo' },
  { id: 'consumible', label: 'Nuevo consumible' },
  { id: 'mov-activo', label: 'Movimiento de activo' },
  { id: 'mov-consumible', label: 'Movimiento de consumible' },
]

/**
 * TODO: Reemplazar proveedoresMock por datos reales desde la tabla `proveedores` en Supabase.
 *
 * Futura tabla sugerida — proveedores:
 * - id (uuid / serial)
 * - nombre (text)
 * - cuit (text)
 * - telefono (text)
 * - email (text)
 * - contacto (text)
 * - rubro (text)
 * - observaciones (text)
 * - activo (boolean)
 * - created_at (timestamptz)
 */
const proveedoresMock = [
  'Seleccionar proveedor',
  'YPF Ruta',
  'Bulonera',
  'Ferretería industrial',
  'Proveedor externo',
  'Otro',
]

const PROVEEDOR_DEFAULT = proveedoresMock[0]!

const categoriasActivo = [
  'Unidad PH',
  'Sensor WIKA',
  'Línea / accesorio',
  'Herramienta',
  'Seguridad',
  'Piletas',
  'Otro',
]

type PreviewPayload =
  | { tab: 'activo'; values: Record<string, string>; docTitle: string }
  | { tab: 'consumible'; values: Record<string, string>; docTitle: string }
  | { tab: 'mov-activo'; values: Record<string, string>; docTitle: string }
  | { tab: 'mov-consumible'; values: Record<string, string>; docTitle: string }

function FieldRow({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface-2 px-3 py-2', className)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm font-semibold">{value || '—'}</div>
    </div>
  )
}

function inputClass() {
  return 'mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:ring-4 focus:ring-black/5 dark:focus:ring-white/10'
}

function textareaClass() {
  return 'mt-2 min-h-[96px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:ring-4 focus:ring-black/5 dark:focus:ring-white/10'
}

export function GestionInventarioClient() {
  return (
    <GestionInventarioGate>
      {({ logout }) => <GestionInventarioAuthed logout={logout} />}
    </GestionInventarioGate>
  )
}

function GestionInventarioAuthed({ logout }: { logout: () => void }) {
  const [tab, setTab] = React.useState<TabId>('activo')

  /** Vista previa del “documento operativo” (solo frontend). */
  const [preview, setPreview] = React.useState<PreviewPayload | null>(null)

  const [nuevoActivo, setNuevoActivo] = React.useState({
    categoria: '',
    descripcion: '',
    proveedor: PROVEEDOR_DEFAULT,
    numero_serie: '',
    marca: '',
    estado: '',
    ubicacion: '',
    asignado_a: '',
    vencimiento: '',
    dias_aviso: '',
    observaciones: '',
  })

  /** Archivo adjunto (solo cliente). El input file no admite value controlado; el archivo vive en estado. */
  const [certificadoArchivo, setCertificadoArchivo] = React.useState<File | null>(null)

  const [nuevoConsumible, setNuevoConsumible] = React.useState({
    descripcion: '',
    categoria: '',
    proveedor: PROVEEDOR_DEFAULT,
    cantidad_inicial: '',
    stock_minimo: '',
    ubicacion: '',
    observaciones: '',
  })

  const [movActivo, setMovActivo] = React.useState({
    fecha: '',
    activo: '',
    numero_serie: '',
    tipo_movimiento: '' as '' | 'asignación' | 'devolución' | 'traslado' | 'baja' | 'reparación',
    origen: '',
    destino: '',
    entrega: '',
    recibe: '',
    motivo: '',
    observaciones: '',
  })

  const [movConsumible, setMovConsumible] = React.useState({
    fecha: '',
    consumible: '',
    tipo_movimiento: '' as '' | 'ingreso' | 'egreso' | 'ajuste' | 'devolución',
    cantidad: '',
    origen: '',
    destino: '',
    entrega: '',
    recibe: '',
    motivo_uso: '',
    observaciones: '',
  })

  function previewActivo() {
    setPreview({
      tab: 'activo',
      docTitle: 'Documento · Alta de activo',
      values: {
        Categoría: nuevoActivo.categoria,
        Descripción: nuevoActivo.descripcion,
        Proveedor:
          nuevoActivo.proveedor === PROVEEDOR_DEFAULT ? '' : nuevoActivo.proveedor,
        'Número de serie': nuevoActivo.numero_serie,
        Marca: nuevoActivo.marca,
        Estado: nuevoActivo.estado,
        Ubicación: nuevoActivo.ubicacion,
        'Asignado a': nuevoActivo.asignado_a,
        Vencimiento: nuevoActivo.vencimiento,
        'Días de aviso': nuevoActivo.dias_aviso,
        ...(certificadoArchivo
          ? { 'Certificado / documentación': certificadoArchivo.name }
          : {}),
        Observaciones: nuevoActivo.observaciones,
      },
    })
  }

  function previewConsumible() {
    setPreview({
      tab: 'consumible',
      docTitle: 'Documento · Alta de consumible',
      values: {
        Descripción: nuevoConsumible.descripcion,
        Categoría: nuevoConsumible.categoria,
        Proveedor:
          nuevoConsumible.proveedor === PROVEEDOR_DEFAULT
            ? ''
            : nuevoConsumible.proveedor,
        'Cantidad inicial': nuevoConsumible.cantidad_inicial,
        'Stock mínimo': nuevoConsumible.stock_minimo,
        Ubicación: nuevoConsumible.ubicacion,
        Observaciones: nuevoConsumible.observaciones,
      },
    })
  }

  function previewMovActivo() {
    setPreview({
      tab: 'mov-activo',
      docTitle: 'Documento · Movimiento de activo',
      values: {
        Fecha: movActivo.fecha,
        'Activo / equipo': movActivo.activo,
        'Número de serie': movActivo.numero_serie,
        'Tipo de movimiento': movActivo.tipo_movimiento,
        Origen: movActivo.origen,
        Destino: movActivo.destino,
        Entrega: movActivo.entrega,
        Recibe: movActivo.recibe,
        Motivo: movActivo.motivo,
        Observaciones: movActivo.observaciones,
      },
    })
  }

  function previewMovConsumible() {
    setPreview({
      tab: 'mov-consumible',
      docTitle: 'Documento · Movimiento de consumible',
      values: {
        Fecha: movConsumible.fecha,
        Consumible: movConsumible.consumible,
        'Tipo de movimiento': movConsumible.tipo_movimiento,
        Cantidad: movConsumible.cantidad,
        Origen: movConsumible.origen,
        'Destino / pozo / unidad / base': movConsumible.destino,
        Entrega: movConsumible.entrega,
        Recibe: movConsumible.recibe,
        'Motivo de uso': movConsumible.motivo_uso,
        Observaciones: movConsumible.observaciones,
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestión de inventario"
        subtitle="Alta, movimientos y trazabilidad de activos y consumibles."
        right={
          <>
            <StatusBadge variant="warning">Acceso restringido</StatusBadge>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              Cerrar sesión
            </button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 border-b border-border pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id)
              setPreview(null)
            }}
            className={cn(
              'rounded-t-xl px-4 py-2 text-sm font-semibold transition',
              tab === t.id
                ? 'bg-surface shadow-[var(--shadow-app)] ring-1 ring-border'
                : 'text-muted hover:bg-surface-2 hover:text-app'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'activo' ? (
        <Card>
          <CardHeader>
            <div>
              <div className="text-lg font-semibold">Nuevo activo</div>
              <div className="mt-1 text-sm text-muted">
                Registro inicial del equipo en inventario (sin envío al servidor todavía).
              </div>
            </div>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="grid gap-4 md:grid-cols-2">
              
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Descripción
                </label>
                <input className={inputClass()} value={nuevoActivo.descripcion}
                  onChange={(e) => setNuevoActivo((s) => ({ ...s, descripcion: e.target.value }))} />
              </div><div>
  <label className="text-xs font-semibold uppercase tracking-wide text-muted">
    Categoría
  </label>

  <select
    className={inputClass()}
    value={nuevoActivo.categoria}
    onChange={(e) =>
      setNuevoActivo((s) => ({
        ...s,
        categoria: e.target.value,
      }))
    }
  >
    <option value="">Seleccionar categoría</option>

    {categoriasActivo.map((categoria) => (
      <option key={categoria} value={categoria}>
        {categoria}
      </option>
    ))}
  </select>
</div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Proveedor
                </label>
                <select
                  className={inputClass()}
                  value={nuevoActivo.proveedor}
                  onChange={(e) =>
                    setNuevoActivo((s) => ({ ...s, proveedor: e.target.value }))
                  }
                >
                  {proveedoresMock.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Número de serie
                </label>
                <input className={inputClass()} value={nuevoActivo.numero_serie}
                  onChange={(e) => setNuevoActivo((s) => ({ ...s, numero_serie: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Marca
                </label>
                <input className={inputClass()} value={nuevoActivo.marca}
                  onChange={(e) => setNuevoActivo((s) => ({ ...s, marca: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Estado
                </label>
                <input className={inputClass()} value={nuevoActivo.estado}
                  onChange={(e) => setNuevoActivo((s) => ({ ...s, estado: e.target.value }))} placeholder="Ej. operativo / en reparación" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Ubicación
                </label>
                <input className={inputClass()} value={nuevoActivo.ubicacion}
                  onChange={(e) => setNuevoActivo((s) => ({ ...s, ubicacion: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Asignado a
                </label>
                <input className={inputClass()} value={nuevoActivo.asignado_a}
                  onChange={(e) => setNuevoActivo((s) => ({ ...s, asignado_a: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Vencimiento
                </label>
                <input type="date" className={inputClass()} value={nuevoActivo.vencimiento}
                  onChange={(e) => setNuevoActivo((s) => ({ ...s, vencimiento: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Días de aviso
                </label>
                <input className={inputClass()} inputMode="numeric" value={nuevoActivo.dias_aviso}
                  onChange={(e) => setNuevoActivo((s) => ({ ...s, dias_aviso: e.target.value }))}
                  placeholder="Antes del vencimiento" />
              </div>
              <div className="md:col-span-2">
                {/* TODO: Subir este archivo a Supabase Storage y persistir la URL pública en certificado_url vía POST /activos (junto al resto del alta). */}
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Certificado / documentación
                </label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className={cn(
                    inputClass(),
                    'cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-semibold'
                  )}
                  onChange={(e) => setCertificadoArchivo(e.target.files?.[0] ?? null)}
                />
                <p className="mt-2 text-sm text-muted">
                  {certificadoArchivo ? (
                    <span className="font-semibold text-app">{certificadoArchivo.name}</span>
                  ) : (
                    'Ningún archivo seleccionado.'
                  )}
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Observaciones
                </label>
                <textarea className={textareaClass()} value={nuevoActivo.observaciones}
                  onChange={(e) =>
                    setNuevoActivo((s) => ({ ...s, observaciones: e.target.value }))
                  } />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={previewActivo}
                className="h-11 rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] px-5 text-sm font-semibold text-white hover:opacity-95">
                Vista previa
              </button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'consumible' ? (
        <Card>
          <CardHeader>
            <div>
              <div className="text-lg font-semibold">Nuevo consumible</div>
              <div className="mt-1 text-sm text-muted">Alta de material de stock inicial.</div>
            </div>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Descripción
                </label>
                <input className={inputClass()} value={nuevoConsumible.descripcion}
                  onChange={(e) =>
                    setNuevoConsumible((s) => ({ ...s, descripcion: e.target.value }))
                  } />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Categoría
                </label>
                <input className={inputClass()} value={nuevoConsumible.categoria}
                  onChange={(e) =>
                    setNuevoConsumible((s) => ({ ...s, categoria: e.target.value }))
                  } />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Proveedor
                </label>
                <select
                  className={inputClass()}
                  value={nuevoConsumible.proveedor}
                  onChange={(e) =>
                    setNuevoConsumible((s) => ({ ...s, proveedor: e.target.value }))
                  }
                >
                  {proveedoresMock.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Cantidad inicial
                </label>
                <input className={inputClass()} inputMode="decimal" value={nuevoConsumible.cantidad_inicial}
                  onChange={(e) =>
                    setNuevoConsumible((s) => ({ ...s, cantidad_inicial: e.target.value }))
                  } />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Stock mínimo
                </label>
                <input className={inputClass()} inputMode="decimal" value={nuevoConsumible.stock_minimo}
                  onChange={(e) =>
                    setNuevoConsumible((s) => ({ ...s, stock_minimo: e.target.value }))
                  } />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Ubicación
                </label>
                <input className={inputClass()} value={nuevoConsumible.ubicacion}
                  onChange={(e) =>
                    setNuevoConsumible((s) => ({ ...s, ubicacion: e.target.value }))
                  } />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Observaciones
                </label>
                <textarea className={textareaClass()} value={nuevoConsumible.observaciones}
                  onChange={(e) =>
                    setNuevoConsumible((s) => ({ ...s, observaciones: e.target.value }))
                  } />
              </div>
            </div>
            <div className="mt-6">
              <button type="button" onClick={previewConsumible}
                className="h-11 rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] px-5 text-sm font-semibold text-white hover:opacity-95">
                Vista previa
              </button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'mov-activo' ? (
        <Card>
          <CardHeader>
            <div>
              <div className="text-lg font-semibold">Movimiento de activo</div>
              <div className="mt-1 text-sm text-muted">
                Traslado, asignación u otro movimiento de equipo (sin persistencia aún).
              </div>
            </div>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Fecha
                </label>
                <input type="datetime-local" className={inputClass()} value={movActivo.fecha}
                  onChange={(e) => setMovActivo((s) => ({ ...s, fecha: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Activo / equipo
                </label>
                <input
                  className={inputClass()}
                  value={movActivo.activo}
                  onChange={(e) => setMovActivo((s) => ({ ...s, activo: e.target.value }))}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Número de serie
                </label>
                <input
                  name="numero_serie"
                  className={inputClass()}
                  value={movActivo.numero_serie}
                  onChange={(e) =>
                    setMovActivo((s) => ({ ...s, numero_serie: e.target.value }))
                  }
                  placeholder="Identifica la pieza única que se mueve"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Tipo de movimiento
                </label>
                <select
                  className={inputClass()}
                  value={movActivo.tipo_movimiento}
                  onChange={(e) =>
                    setMovActivo((s) => ({
                      ...s,
                      tipo_movimiento: e.target.value as typeof s.tipo_movimiento,
                    }))
                  }
                >
                  <option value="">Seleccionar…</option>
                  <option value="asignación">Asignación</option>
                  <option value="devolución">Devolución</option>
                  <option value="traslado">Traslado</option>
                  <option value="baja">Baja</option>
                  <option value="reparación">Reparación</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Origen
                </label>
                <input className={inputClass()} value={movActivo.origen}
                  onChange={(e) => setMovActivo((s) => ({ ...s, origen: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Destino
                </label>
                <input className={inputClass()} value={movActivo.destino}
                  onChange={(e) => setMovActivo((s) => ({ ...s, destino: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Entrega
                </label>
                <input className={inputClass()} value={movActivo.entrega}
                  onChange={(e) => setMovActivo((s) => ({ ...s, entrega: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Recibe
                </label>
                <input className={inputClass()} value={movActivo.recibe}
                  onChange={(e) => setMovActivo((s) => ({ ...s, recibe: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Motivo
                </label>
                <input className={inputClass()} value={movActivo.motivo}
                  onChange={(e) => setMovActivo((s) => ({ ...s, motivo: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Observaciones
                </label>
                <textarea className={textareaClass()} value={movActivo.observaciones}
                  onChange={(e) =>
                    setMovActivo((s) => ({ ...s, observaciones: e.target.value }))
                  } />
              </div>
            </div>
            <div className="mt-6">
              <button type="button" onClick={previewMovActivo}
                className="h-11 rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] px-5 text-sm font-semibold text-white hover:opacity-95">
                Vista previa
              </button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'mov-consumible' ? (
        <Card>
          <CardHeader>
            <div>
              <div className="text-lg font-semibold">Movimiento de consumible</div>
              <div className="mt-1 text-sm text-muted">Registro operativo de stock (sin guardar).</div>
            </div>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Fecha
                </label>
                <input type="datetime-local" className={inputClass()} value={movConsumible.fecha}
                  onChange={(e) =>
                    setMovConsumible((s) => ({ ...s, fecha: e.target.value }))
                  } />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Consumible
                </label>
                <input className={inputClass()} value={movConsumible.consumible}
                  onChange={(e) =>
                    setMovConsumible((s) => ({ ...s, consumible: e.target.value }))
                  } />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Tipo de movimiento
                </label>
                <select
                  className={inputClass()}
                  value={movConsumible.tipo_movimiento}
                  onChange={(e) =>
                    setMovConsumible((s) => ({
                      ...s,
                      tipo_movimiento: e.target.value as typeof s.tipo_movimiento,
                    }))
                  }
                >
                  <option value="">Seleccionar…</option>
                  <option value="ingreso">Ingreso</option>
                  <option value="egreso">Egreso</option>
                  <option value="ajuste">Ajuste</option>
                  <option value="devolución">Devolución</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Cantidad
                </label>
                <input className={inputClass()} inputMode="decimal" value={movConsumible.cantidad}
                  onChange={(e) =>
                    setMovConsumible((s) => ({ ...s, cantidad: e.target.value }))
                  } />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Origen
                </label>
                <input className={inputClass()} value={movConsumible.origen}
                  onChange={(e) =>
                    setMovConsumible((s) => ({ ...s, origen: e.target.value }))
                  } />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Destino / pozo / unidad / base
                </label>
                <input className={inputClass()} value={movConsumible.destino}
                  onChange={(e) =>
                    setMovConsumible((s) => ({ ...s, destino: e.target.value }))
                  } />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Entrega
                </label>
                <input className={inputClass()} value={movConsumible.entrega}
                  onChange={(e) =>
                    setMovConsumible((s) => ({ ...s, entrega: e.target.value }))
                  } />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Recibe
                </label>
                <input className={inputClass()} value={movConsumible.recibe}
                  onChange={(e) =>
                    setMovConsumible((s) => ({ ...s, recibe: e.target.value }))
                  } />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Motivo de uso
                </label>
                <input className={inputClass()} value={movConsumible.motivo_uso}
                  onChange={(e) =>
                    setMovConsumible((s) => ({ ...s, motivo_uso: e.target.value }))
                  } />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Observaciones
                </label>
                <textarea className={textareaClass()} value={movConsumible.observaciones}
                  onChange={(e) =>
                    setMovConsumible((s) => ({ ...s, observaciones: e.target.value }))
                  } />
              </div>
            </div>
            <div className="mt-6">
              <button type="button" onClick={previewMovConsumible}
                className="h-11 rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] px-5 text-sm font-semibold text-white hover:opacity-95">
                Vista previa
              </button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {preview ? <OperativePreviewCard preview={preview} onDismiss={() => setPreview(null)} /> : null}
    </div>
  )
}

function OperativePreviewCard({
  preview,
  onDismiss,
}: {
  preview: PreviewPayload
  onDismiss: () => void
}) {
  const fechaDisplay =
    (preview.values.Fecha && preview.values.Fecha.trim()) ||
    (preview.values.Vencimiento && preview.values.Vencimiento.trim()) ||
    '—'

  /** Evita duplicar filas ya mostradas en el pie del comprobante. */
  const footerKeys = new Set(['Entrega', 'Recibe', 'Motivo', 'Motivo de uso', 'Observaciones'])
  /** Fecha se muestra en el encabezado del documento, no repetir como fila. */
  const dateRowKeys = new Set(['Fecha', 'Vencimiento'])

  const principalEntries = Object.entries(preview.values).filter(
    ([key]) => !footerKeys.has(key) && !dateRowKeys.has(key)
  )

  const movimientoPie =
    preview.tab === 'mov-activo' || preview.tab === 'mov-consumible'

  return (
    <Card className="border-2 border-dashed border-border">
      <CardHeader>
        <div>
          <div className="text-lg font-semibold">{preview.docTitle}</div>
          <div className="mt-1 text-sm text-muted">
            Vista previa interna · no persistida. Los botones de guardado/PDF se habilitarán cuando el backend
            confirme el registro.
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-2"
        >
          Ocultar
        </button>
      </CardHeader>
      <CardBody className="space-y-4 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3">
          <div className="text-sm">
            <span className="text-muted">Fecha del documento</span>
            <div className="mt-1 font-semibold">{fechaDisplay}</div>
          </div>
          <StatusBadge variant="warning">Pendiente de guardar</StatusBadge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {principalEntries.map(([k, v]) => (
            <FieldRow key={k} label={k} value={v} />
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow
            label="Quién entrega"
            value={movimientoPie ? preview.values.Entrega || '' : '—'}
          />
          <FieldRow
            label="Quién recibe"
            value={movimientoPie ? preview.values.Recibe || '' : '—'}
          />
          <FieldRow
            label={
              preview.tab === 'mov-consumible'
                ? 'Motivo de uso'
                : preview.tab === 'mov-activo'
                ? 'Motivo'
                : 'Motivo / detalle operativo'
            }
            value={
              preview.values.Motivo ||
              preview.values['Motivo de uso'] ||
              (movimientoPie ? '' : '—')
            }
          />
          <FieldRow
            label="Observaciones"
            value={preview.values.Observaciones || ''}
            className="sm:col-span-2"
          />
        </div>

        <div className="flex flex-wrap gap-3 border-t border-border pt-4">
          <button
            type="button"
            disabled
            title="Se conectará a POST cuando el backend confirme el contrato."
            className="h-11 cursor-not-allowed rounded-xl bg-surface px-4 text-sm font-semibold opacity-50"
          >
            Guardar registro
          </button>
          <button
            type="button"
            disabled
            title="Se usará POST /generar-pdf-movimiento (o endpoint equivalente) cuando exista en backend."
            className="h-11 cursor-not-allowed rounded-xl border border-border bg-surface px-4 text-sm font-semibold opacity-50"
          >
            Generar PDF
          </button>
        </div>
      </CardBody>
    </Card>
  )
}
