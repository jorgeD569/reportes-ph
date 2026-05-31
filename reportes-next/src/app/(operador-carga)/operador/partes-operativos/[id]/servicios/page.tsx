'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { ParteOperativoFlowSteps } from '@/components/operador/ParteOperativoFlowSteps'
import { btnSecondaryClass, inputClass, pageSectionClass } from '@/components/operador/parte-operativo-styles'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { Td, Th } from '@/components/ui/ModernTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/cn'
import { post } from '@/lib/api'
import { routes } from '@/lib/constants/routes'

type GuardarServiciosResponse = {
  ok?: boolean
  error?: string
}

type CerrarParteResponse = {
  ok?: boolean
  pdf_url?: string
  error?: string
}

const btnPrimaryClass =
  'inline-flex h-11 w-full min-w-0 max-w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] px-5 text-sm font-semibold text-white shadow-[var(--shadow-app)] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto lg:min-w-[220px]'

const cantidadInputClass = cn(
  inputClass,
  'w-24 max-w-[120px] shrink-0 text-center tabular-nums'
)

const serviciosBase = [
  { codigo: '10', pos: '1', descripcion: 'UNIDAD PESADA - (Op/Ay/Resc)' },
  { codigo: '10', pos: '3', descripcion: 'km unidad pesada -' },
  { codigo: '10', pos: '5', descripcion: 'Montaje/Desmont BPV/TWC C/ Lub' },
  { codigo: '10', pos: '17', descripcion: 'Lubricador lat Telescop.' },
  { codigo: '10', pos: '27', descripcion: 'Prueba hidrául. líneas y válvulas h/ 5 v' },
  { codigo: '10', pos: '29', descripcion: 'Prueba hidrául líneas y válvulas - Valv ad.' },
  { codigo: '10', pos: '31', descripcion: 'Engrase válvulas h/ 5 válv - Diám h/ 4' },
  { codigo: '10', pos: '33', descripcion: 'Engrase válvulas cargo adic - Diám h/ 4' },
  { codigo: '10', pos: '35', descripcion: 'Engrase válvulas - Diám dde 5 1/8 h/7 plg' },
  { codigo: '10', pos: '37', descripcion: 'Torqueo hasta 5 bridas - Cargo básico' },
  { codigo: '10', pos: '39', descripcion: 'Torqueo brida/Valvula adicional' },
  { codigo: '10', pos: '41', descripcion: 'Servicio de cierre, montaje y PH de Rodlock' },
]

function ServicioCantidadInput({
  pos,
  value,
  onChange,
}: {
  pos: string
  value: string
  onChange: (pos: string, value: string) => void
}) {
  return (
    <input
      type="number"
      min="0"
      inputMode="numeric"
      aria-label={`Cantidad posición ${pos}`}
      className={cantidadInputClass}
      value={value}
      onChange={(e) => onChange(pos, e.target.value)}
    />
  )
}

export default function ServiciosParteOperativoPage() {
  const params = useParams()
  const id = params.id as string

  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [parteCerrado, setParteCerrado] = useState(false)

  function cambiarCantidad(pos: string, value: string) {
    setCantidades((prev) => ({ ...prev, [pos]: value }))
  }

  function abrirPdf() {
    if (!pdfUrl) return
    window.open(pdfUrl, '_blank', 'noopener,noreferrer')
  }

  async function guardarServicios() {
    const parteId = encodeURIComponent(id)

    try {
      setLoading(true)
      setError(null)
      setPdfUrl(null)
      setParteCerrado(false)

      const servicios = serviciosBase
        .map((servicio) => ({
          parte_id: id,
          codigo_servicio: servicio.codigo,
          pos: servicio.pos,
          descripcion: servicio.descripcion,
          cantidad: Number(cantidades[servicio.pos] || 0),
        }))
        .filter((servicio) => servicio.cantidad > 0)

      if (servicios.length === 0) {
        setError('Tenés que cargar al menos un servicio con cantidad mayor a 0')
        return
      }

      const guardarData = await post<GuardarServiciosResponse>(
        `/partes-operativos/${parteId}/servicios`,
        { servicios }
      )

      if (guardarData.ok === false) {
        throw new Error(guardarData.error || 'Error guardando servicios')
      }

      const cerrarData = await post<CerrarParteResponse>(
        `/partes-operativos/${parteId}/cerrar`,
        {}
      )

      if (cerrarData.ok === false) {
        throw new Error(cerrarData.error || 'Error cerrando parte')
      }

      const urlPdfGenerado =
        typeof cerrarData.pdf_url === 'string' ? cerrarData.pdf_url.trim() : ''

      if (urlPdfGenerado) {
        setPdfUrl(urlPdfGenerado)
        setParteCerrado(true)
        return
      }

      setError('Parte cerrado correctamente, pero no se recibió URL del PDF.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cerrar el parte')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`mx-auto w-full max-w-none space-y-6 lg:max-w-6xl ${pageSectionClass}`}>
      <PageHeader
        title="Servicios del parte"
        subtitle="Cargá cantidades y cerrá el parte para generar el PDF operativo."
      />

      <ParteOperativoFlowSteps current="servicios" parteCerrado={parteCerrado && Boolean(pdfUrl)} />

      {error ? (
        <InlineMessage kind="error" title="Atención" description={error} />
      ) : null}

      {parteCerrado && pdfUrl ? (
        <InlineMessage
          kind="success"
          title="Parte cerrado correctamente"
          description="El PDF del parte operativo está listo. Podés abrirlo cuando quieras."
        />
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <div className="text-sm font-semibold text-app">Listado de servicios</div>
            <div className="mt-1 text-sm text-muted">
              Ingresá la cantidad realizada para cada línea. Solo se guardan filas con cantidad
              mayor a cero.
            </div>
          </div>
        </CardHeader>
        <CardBody className="pt-0">
          {/* Mobile / tablet: cards */}
          <ul className="space-y-3 lg:hidden">
            {serviciosBase.map((servicio) => (
              <li
                key={servicio.pos}
                className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-app)]"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span className="rounded-lg bg-surface-2 px-2 py-1">Línea {servicio.codigo}</span>
                  <span className="rounded-lg bg-surface-2 px-2 py-1">Pos {servicio.pos}</span>
                </div>
                <p className="mt-3 text-sm font-medium leading-snug text-app">
                  {servicio.descripcion}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Cantidad
                  </span>
                  <ServicioCantidadInput
                    pos={servicio.pos}
                    value={cantidades[servicio.pos] || ''}
                    onChange={cambiarCantidad}
                  />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabla con columnas proporcionadas */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border lg:block">
            <table className="w-full table-fixed border-collapse bg-surface">
              <colgroup>
                <col className="w-[4.5rem]" />
                <col className="w-[4.5rem]" />
                <col />
                <col className="w-[8.5rem]" />
              </colgroup>
              <thead>
                <tr>
                  <Th>Línea</Th>
                  <Th>Pos</Th>
                  <Th>Servicio</Th>
                  <Th className="text-right">Cantidad</Th>
                </tr>
              </thead>
              <tbody>
                {serviciosBase.map((servicio) => (
                  <tr key={servicio.pos} className="border-t border-border">
                    <Td className="tabular-nums">{servicio.codigo}</Td>
                    <Td className="tabular-nums">{servicio.pos}</Td>
                    <Td className="min-w-0 break-words">{servicio.descripcion}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end">
                        <ServicioCantidadInput
                          pos={servicio.pos}
                          value={cantidades[servicio.pos] || ''}
                          onChange={cambiarCantidad}
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-start">
            <Link
              href={routes.operador.parteOperativo(id)}
              className={cn(btnSecondaryClass, 'w-full justify-center sm:w-auto')}
            >
              Volver a observaciones
            </Link>
            {parteCerrado && pdfUrl ? (
              <button
                type="button"
                onClick={abrirPdf}
                className={btnPrimaryClass}
              >
                Ver PDF
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void guardarServicios()}
                disabled={loading}
                className={btnPrimaryClass}
              >
                {loading ? 'Generando PDF...' : 'Cerrar parte y generar PDF'}
              </button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
