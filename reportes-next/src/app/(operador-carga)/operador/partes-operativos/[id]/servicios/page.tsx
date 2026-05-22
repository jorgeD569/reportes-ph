'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { ParteOperativoFlowSteps } from '@/components/operador/ParteOperativoFlowSteps'
import { btnSecondaryClass, inputClass } from '@/components/operador/parte-operativo-styles'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { ModernTable, Td, Th } from '@/components/ui/ModernTable'
import { PageHeader } from '@/components/ui/PageHeader'
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
  'inline-flex h-11 min-w-[220px] items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] px-5 text-sm font-semibold text-white shadow-[var(--shadow-app)] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60'

const serviciosBase = [
  { codigo: '10', pos: '1', descripcion: 'UNIDAD PESADA - (Op/Ay/Resc)' },
  { codigo: '10', pos: '5', descripcion: 'Montaje/Desmont BPV/TWC C/ Lub' },
  { codigo: '10', pos: '17', descripcion: 'Lubricador lat Telescop.' },
  { codigo: '10', pos: '27', descripcion: 'Prueba hidrául. líneas y válvulas h/ 5 v' },
  { codigo: '10', pos: '29', descripcion: 'Prueba hidrául líneas y válvulas - Valv ad.' },
  { codigo: '10', pos: '31', descripcion: 'Engrase válvulas h/ 5 válv - Diám h/ 4' },
  { codigo: '10', pos: '33', descripcion: 'Engrase válvulas cargo adic - Diám h/ 4' },
  { codigo: '10', pos: '35', descripcion: 'Engrase válvulas - Diám dde 5 1/8 h/7 plg' },
  { codigo: '10', pos: '37', descripcion: 'Torqueo hasta 5 bridas - Cargo básico' },
  { codigo: '10', pos: '39', descripcion: 'Torqueo brida/Valvula adicional' },
]

export default function ServiciosParteOperativoPage() {
  const params = useParams()
  const id = params.id as string

  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cambiarCantidad(pos: string, value: string) {
    setCantidades((prev) => ({ ...prev, [pos]: value }))
  }

  async function guardarServicios() {
    const parteId = encodeURIComponent(id)

    try {
      setLoading(true)
      setError(null)

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

      const pdfUrl =
        typeof cerrarData.pdf_url === 'string' ? cerrarData.pdf_url.trim() : ''

      if (pdfUrl) {
        window.location.href = pdfUrl
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
    <div className="space-y-6">
      <PageHeader
        title="Servicios del parte"
        subtitle="Cargá cantidades y cerrá el parte para generar el PDF operativo."
      />

      <ParteOperativoFlowSteps current="servicios" />

      {error ? (
        <InlineMessage kind="error" title="Atención" description={error} />
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
          <ModernTable>
            <thead>
              <tr>
                <Th>Línea</Th>
                <Th>Pos</Th>
                <Th>Servicio</Th>
                <Th className="w-28">Cantidad</Th>
              </tr>
            </thead>
            <tbody>
              {serviciosBase.map((servicio) => (
                <tr key={servicio.pos} className="border-t border-border">
                  <Td>{servicio.codigo}</Td>
                  <Td>{servicio.pos}</Td>
                  <Td>{servicio.descripcion}</Td>
                  <Td>
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      value={cantidades[servicio.pos] || ''}
                      onChange={(e) => cambiarCantidad(servicio.pos, e.target.value)}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </ModernTable>

          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href={routes.operador.parteOperativo(id)} className={btnSecondaryClass}>
              Volver a observaciones
            </Link>
            <button
              type="button"
              onClick={() => void guardarServicios()}
              disabled={loading}
              className={btnPrimaryClass}
            >
              {loading ? 'Generando PDF...' : 'Cerrar parte y generar PDF'}
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
