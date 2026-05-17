'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'

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

  function cambiarCantidad(pos: string, value: string) {
    setCantidades({
      ...cantidades,
      [pos]: value,
    })
  }

  async function guardarServicios() {
    try {
      setLoading(true)

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
        alert('Tenés que cargar al menos un servicio con cantidad mayor a 0')
        return
      }

      const response = await fetch(
        `http://localhost:3000/partes-operativos/${id}/servicios`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ servicios }),
        }
      )

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Error guardando servicios')
      }
      
      const cerrarResponse = await fetch(
        `http://localhost:3000/partes-operativos/${id}/cerrar`,
        {
          method: 'POST',
        }
      )
      
      const cerrarData = await cerrarResponse.json()
      
      if (!cerrarResponse.ok || !cerrarData.ok) {
        throw new Error(cerrarData.error || 'Error cerrando parte')
      }
      
      alert('Parte cerrado correctamente')
    } catch (error: any) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 30 }}>
      <h1>Servicios del Parte Operativo</h1>

      <p style={{ marginTop: 10 }}>
        Cargá las cantidades de los servicios realizados.
      </p>

      <table
        style={{
          width: '100%',
          marginTop: 25,
          borderCollapse: 'collapse',
          background: 'white',
        }}
      >
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: 10 }}>Línea</th>
            <th style={{ border: '1px solid #ddd', padding: 10 }}>Pos</th>
            <th style={{ border: '1px solid #ddd', padding: 10 }}>Servicio</th>
            <th style={{ border: '1px solid #ddd', padding: 10 }}>Cantidad</th>
          </tr>
        </thead>

        <tbody>
          {serviciosBase.map((servicio) => (
            <tr key={servicio.pos}>
              <td style={{ border: '1px solid #ddd', padding: 10 }}>
                {servicio.codigo}
              </td>
              <td style={{ border: '1px solid #ddd', padding: 10 }}>
                {servicio.pos}
              </td>
              <td style={{ border: '1px solid #ddd', padding: 10 }}>
                {servicio.descripcion}
              </td>
              <td style={{ border: '1px solid #ddd', padding: 10 }}>
                <input
                  type="number"
                  min="0"
                  value={cantidades[servicio.pos] || ''}
                  onChange={(e) =>
                    cambiarCantidad(servicio.pos, e.target.value)
                  }
                  style={{
                    width: 100,
                    padding: 8,
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={guardarServicios}
        disabled={loading}
        style={{
          marginTop: 25,
          padding: '12px 20px',
          cursor: 'pointer',
        }}
      >
        {loading ? 'Cerrando parte...' : 'Cerrar Parte'}
      </button>
    </div>
  )
}