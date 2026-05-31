'use client'

import { useState, type FormEvent } from 'react'
import { ParteOperativoFlowSteps } from '@/components/operador/ParteOperativoFlowSteps'
import { inputClass, labelClass, formGridClass, pageSectionClass } from '@/components/operador/parte-operativo-styles'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { PageHeader } from '@/components/ui/PageHeader'
import { post } from '@/lib/api'
import { routes } from '@/lib/constants/routes'
import { getFechaLocalHoy } from '@/lib/date'

type CrearParteResponse = {
  ok?: boolean
  error?: string
  parte?: { id: string }
}

const submitButtonClass =
  'block h-12 w-full max-w-full rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] px-6 text-sm font-semibold text-white shadow-[var(--shadow-app)] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto lg:min-w-[240px]'

const yacimientosPorOperadora: Record<string, string[]> = {
  YPF: [
    'LOMA LA LATA',
    'LOMA CAMPANA',
    'LA AMARGA CHICA',
    'LAS CAVERNAS',
    'EL OREJANO',
    'AGUADA DEL CHIVATO',
    'SHALE OIL',
  ],
}

const operadorasFrecuentes = [
  'YPF',
  'VISTA ENERGY',
  'CHEVRON',
  'TECPETROL',
  'PRODENG',
  'PAMPA ENERGIA',
]

export default function ParteOperativoPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    fecha: getFechaLocalHoy(),
    pozo: '',
    yacimiento: '',
    operadora: '',
    contratista: 'KOMPASS',
    unidad_pesada: '',
    salida_desde: '',
    km: '',
    supervisor_operativo: '',
    operador_1: '',
    operador_2: '',
    operador_3: '',
  })

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const yacimientosSugeridos =
    yacimientosPorOperadora[form.operadora.trim().toUpperCase()] ?? []

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    await generarParte()
  }

  async function generarParte() {
    if (!form.pozo.trim()) {
      setError('El pozo es obligatorio.')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const data = await post<CrearParteResponse>('/partes-operativos', form)

      if (!data.ok || !data.parte?.id) {
        throw new Error(data.error || 'Error creando parte')
      }

      window.open(routes.operador.parteOperativo(data.parte.id), '_blank')

      setForm({
        fecha: getFechaLocalHoy(),
        pozo: '',
        yacimiento: '',
        operadora: '',
        contratista: 'KOMPASS',
        unidad_pesada: '',
        salida_desde: '',
        km: '',
        supervisor_operativo: '',
        operador_1: '',
        operador_2: '',
        operador_3: '',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creando parte')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`space-y-6 ${pageSectionClass}`}>
      <PageHeader
        title="Nuevo parte operativo"
        subtitle="Completá los datos iniciales. Se abrirá una ventana de carga sin menú lateral para continuar el flujo."
      />

      <ParteOperativoFlowSteps current="alta" />

      {error ? (
        <InlineMessage kind="error" title="No se pudo crear el parte" description={error} />
      ) : null}

      <form id="crear-parte-operativo" onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <div className="text-sm font-semibold text-app">Datos del parte</div>
              <div className="mt-1 text-sm text-muted">
                Información general para iniciar el parte operativo en campo.
              </div>
            </div>
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
                <label className={labelClass} htmlFor="pozo">
                  Pozo *
                </label>
                <input
                  id="pozo"
                  className={inputClass}
                  value={form.pozo}
                  onChange={(e) => setField('pozo', e.target.value)}
                  placeholder="Nombre del pozo"
                />
              </div>             

              <div>
                <label className={labelClass} htmlFor="operadora">
                  Operadora
                </label>
                <input
                  id="operadora"
                  className={inputClass}
                  list="operadoras-frecuentes"
                  value={form.operadora}
                  onChange={(e) => setField('operadora', e.target.value)}
                />
                <datalist id="operadoras-frecuentes">
                  {operadorasFrecuentes.map((operadora) => (
                    <option key={operadora} value={operadora} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className={labelClass} htmlFor="yacimiento">
                  Yacimiento
                </label>
                <input
                  id="yacimiento"
                  className={inputClass}
                  list="yacimientos-sugeridos"
                  value={form.yacimiento}
                  onChange={(e) => setField('yacimiento', e.target.value)}
                />
                <datalist id="yacimientos-sugeridos">
                  {yacimientosSugeridos.map((yacimiento) => (
                    <option key={yacimiento} value={yacimiento} />
                  ))}
                </datalist>
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
                  KM
                </label>
                <input
                  id="km"
                  className={inputClass}
                  value={form.km}
                  onChange={(e) => setField('km', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="supervisor_operativo">
                  Supervisor operativo
                </label>
                <input
                  id="supervisor_operativo"
                  className={inputClass}
                  value={form.supervisor_operativo}
                  onChange={(e) => setField('supervisor_operativo', e.target.value)}
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
          </CardBody>
        </Card>

        <div className="mt-4">
  <button type="submit" disabled={loading} className={submitButtonClass}>
    {loading ? 'Generando...' : 'Generar parte operativo'}
  </button>
</div>
</form>
</div>
)
}